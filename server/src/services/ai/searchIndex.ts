// ============================================================
// services/ai/searchIndex.ts — "Thủ thư" của trợ lý AI (RAG)
// ============================================================
// RAG = Retrieval-Augmented Generation: trước khi hỏi AI, TÌM các đoạn tài
// liệu liên quan rồi đưa kèm câu hỏi -> AI trả lời dựa trên tài liệu thật.
//
// Cách tìm "theo ý nghĩa": mỗi đoạn tài liệu được model embedding đổi thành
// một vector (dãy ~1000 số). Hai đoạn nói về cùng chuyện thì vector gần nhau
// -> so độ giống (cosine) giữa vector câu hỏi và vector từng đoạn.
//
// Chỉ mục giữ trong bộ nhớ + lưu ra file ai-data/index.json (SQL Server 2022
// chưa có kiểu vector). File này xóa thoải mái: app tự tạo lại.
// Đồng bộ: lúc khởi động, định kỳ, và ngay sau khi có người lưu/xóa bài.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.ts';
import { findDocumentById, listPublishedStamps } from '../../repositories/documents.ts';
import { listTranslations, translationStamps, translationsReady } from '../../repositories/translations.ts';
import { mergeForRead } from '../translate/engine.ts';
import { docSections, sectionUrl, type DocLike } from './docText.ts';
import { embed } from './llm.ts';

export type Chunk = { docId: string; slug: string; title: string; section: string; url: string; text: string; vector: number[] };
type IndexFile = { version: 1; embedModel: string; docs: Record<string, { updatedAt: string; chunks: Chunk[] }> };

const INDEX_FILE = () => path.join(config.ai.dataDir, 'index.json');
const MAX_CHUNK_CHARS = 1500;

let index: IndexFile = { version: 1, embedModel: config.ai.embedModel, docs: {} };

function loadIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(INDEX_FILE(), 'utf8')) as IndexFile;
    // Đổi model embedding thì vector cũ vô nghĩa -> làm lại từ đầu.
    if (data.version === 1 && data.embedModel === config.ai.embedModel) index = data;
  } catch {
    // chưa có file -> chỉ mục rỗng
  }
}

function saveIndex() {
  fs.mkdirSync(config.ai.dataDir, { recursive: true });
  const tmp = `${INDEX_FILE()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(index));
  fs.renameSync(tmp, INDEX_FILE()); // ghi file tạm rồi đổi tên: tắt máy giữa chừng không hỏng file
}

// Chuẩn hóa độ dài vector về 1 -> độ giống cosine chỉ còn là tích vô hướng.
function normalize(v: number[]): number[] {
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);

// Chia tài liệu thành các đoạn: mỗi mục (tiêu đề / bước) một đoạn; mục dài
// thì cắt theo đoạn văn. Mỗi đoạn mở đầu bằng "Tên bài › Tên mục" để model
// embedding hiểu ngữ cảnh.
// anchorSource: dựng đoạn cho BẢN DỊCH -> link nguồn dùng anchor của bài gốc.
export function buildChunks(doc: DocLike & { id: string }, anchorSource?: DocLike['blocks']): Omit<Chunk, 'vector'>[] {
  const chunks: Omit<Chunk, 'vector'>[] = [];
  for (const s of docSections(doc, anchorSource)) {
    if (!s.text.trim() && s.anchor === null) continue;
    const prefix = s.anchor === null ? doc.title : `${doc.title} › ${s.heading}`;
    const base = { docId: doc.id, slug: doc.slug, title: doc.title, section: s.anchor === null ? '' : s.heading, url: sectionUrl(doc.slug, s.anchor) };
    let current = '';
    for (const para of (s.text || s.heading).split(/\n{2,}/)) {
      if (current && current.length + para.length > MAX_CHUNK_CHARS) {
        chunks.push({ ...base, text: `${prefix}\n${current}` });
        current = '';
      }
      current = current ? `${current}\n\n${para}` : para.slice(0, MAX_CHUNK_CHARS * 2);
    }
    if (current) chunks.push({ ...base, text: `${prefix}\n${current}` });
  }
  return chunks;
}

// ---------- Đồng bộ ----------

let syncing: Promise<void> | null = null;
let again = false;
let lastError = '';

// Đoạn của bài gốc + của từng bản dịch (người hỏi bằng tiếng Nhật khớp đoạn tiếng Nhật).
async function docChunks(doc: NonNullable<Awaited<ReturnType<typeof findDocumentById>>>) {
  const original = { id: doc.id, slug: doc.slug, title: doc.title, blocks: doc.blocks ?? [] };
  const chunks = buildChunks(original);
  if (await translationsReady()) {
    for (const row of await listTranslations(Number(doc.id))) {
      const merged = mergeForRead(original, row);
      if (!merged.translatedIds.length) continue; // chưa dịch được gì -> trùng bài gốc
      chunks.push(...buildChunks({ ...original, title: merged.title, blocks: merged.blocks }, original.blocks));
    }
  }
  return chunks;
}

async function runSync() {
  const [stamps, trStamps] = await Promise.all([listPublishedStamps(), translationStamps()]);
  // Dấu thời gian = lúc sửa bài gốc + lúc cập nhật bản dịch -> đổi cái nào cũng lập chỉ mục lại.
  const published = stamps.map((s) => ({ id: s.id, updatedAt: trStamps.has(s.id) ? `${s.updatedAt}|${trStamps.get(s.id)}` : s.updatedAt }));
  const alive = new Set(published.map((d) => d.id));
  let changed = 0;

  // Bài bị xóa / chuyển về nháp -> bỏ khỏi chỉ mục.
  for (const id of Object.keys(index.docs)) {
    if (!alive.has(id)) {
      delete index.docs[id];
      changed++;
    }
  }
  // Bài mới hoặc vừa sửa -> làm lại vector cho bài đó.
  for (const stamp of published) {
    if (index.docs[stamp.id]?.updatedAt === stamp.updatedAt) continue;
    const doc = await findDocumentById(Number(stamp.id));
    if (!doc || doc.status !== 'published') continue;
    const chunks = await docChunks(doc);
    const vectors = chunks.length ? await embed(chunks.map((c) => c.text)) : [];
    index.docs[stamp.id] = { updatedAt: stamp.updatedAt, chunks: chunks.map((c, i) => ({ ...c, vector: normalize(vectors[i]) })) };
    changed++;
  }

  if (changed) {
    saveIndex();
    console.log(`🤖 AI: cập nhật chỉ mục ${changed} tài liệu (tổng ${Object.keys(index.docs).length})`);
  }
}

// Gọi bao nhiêu lần cũng được: đang chạy thì hẹn chạy thêm MỘT lượt sau đó.
export function syncIndex(): Promise<void> {
  if (!config.ai.baseUrl) return Promise.resolve();
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = runSync()
    .then(() => {
      lastError = '';
    })
    .catch((err: Error) => {
      // AI chưa bật -> chỉ báo MỘT lần, lần đồng bộ sau tự thử lại.
      if (err.message !== lastError) console.error('❌ AI: không cập nhật được chỉ mục:', err.message);
      lastError = err.message;
    })
    .finally(() => {
      syncing = null;
      if (again) {
        again = false;
        void syncIndex();
      }
    });
  return syncing;
}

// Lưu/xóa bài -> chờ 3 giây rồi mới đồng bộ (gộp nhiều lần lưu liên tiếp làm một).
let timer: NodeJS.Timeout | undefined;
export function requestIndexSync() {
  if (!config.ai.baseUrl) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncIndex(), 3000);
}

export function startIndexing() {
  if (!config.ai.baseUrl) return;
  loadIndex();
  void syncIndex();
  setInterval(() => void syncIndex(), config.ai.syncMinutes * 60 * 1000).unref();
}

export const indexedDocCount = () => Object.keys(index.docs).length;

// ---------- Tìm kiếm ----------

// Tìm các đoạn giống câu hỏi nhất. Mỗi bài tối đa `perDoc` đoạn để câu trả
// lời không chỉ xoay quanh một bài.
// allowDoc: chỉ tìm trong tài liệu người hỏi được xem (phân quyền theo bộ phận).
export async function searchChunks(
  question: string,
  limit = 6,
  perDoc = 3,
  allowDoc?: (docId: string) => boolean,
): Promise<(Chunk & { score: number })[]> {
  const all = Object.values(index.docs)
    .flatMap((d) => d.chunks)
    .filter((c) => !allowDoc || allowDoc(c.docId));
  if (!all.length) return [];
  const [q] = await embed([question]);
  const qv = normalize(q);
  const ranked = all.map((c) => ({ ...c, score: dot(qv, c.vector) })).sort((a, b) => b.score - a.score);

  const picked: (Chunk & { score: number })[] = [];
  const perDocCount = new Map<string, number>();
  for (const c of ranked) {
    const n = perDocCount.get(c.docId) ?? 0;
    if (n >= perDoc) continue;
    perDocCount.set(c.docId, n + 1);
    picked.push(c);
    if (picked.length >= limit) break;
  }
  return picked;
}
