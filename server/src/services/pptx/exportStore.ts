// ============================================================
// services/pptx/exportStore.ts — Tạo sẵn + lưu file PowerPoint của từng bài
// ============================================================
// Mỗi file ứng với (bài, ngôn ngữ, phiên bản bài, lần cập nhật bản dịch):
//   exports/<id>/<lang>-v<version>-<dấu bản dịch>.pptx   (+ .json: số slide, dung lượng)
// Bài sửa / bản dịch đổi -> tên file đổi -> tự tạo file mới, xóa file cũ.
//
//   requestDeckExports(id) — gọi sau khi lưu bài / có bản dịch: tạo sẵn ở nền
//   ensureDeck(doc, lang)  — lúc tải về: có sẵn thì trả luôn, chưa có thì tạo ngay
//   deckInfo(doc)          — các ngôn ngữ tải được + số slide (cho nút trên web)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../../config.ts';
import { HttpError } from '../../middleware/errorHandler.ts';
import { findDocumentById, type FullDocument } from '../../repositories/documents.ts';
import { listTranslations, translationsReady } from '../../repositories/translations.ts';
import { findUserById } from '../../repositories/users.ts';
import { mergeForRead } from '../translate/engine.ts';
import { detectLang, LANGS, type Lang } from '../translate/texts.ts';
import { buildDeck } from './exportDeck.ts';

type DeckMeta = { file: string; slides: number; bytes: number };

// Địa chỉ máy chủ để link + mã QR trong file mở được từ máy khác / điện thoại.
// PUBLIC_BASE_URL chưa đặt thì đoán theo IP mạng LAN (giống trang upload qua QR).
function baseUrl(): string {
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/\/+$/, '');
  const ip = Object.values(os.networkInterfaces())
    .flat()
    .find((n) => n && n.family === 'IPv4' && !n.internal)?.address;
  return ip ? `http://${ip}:${config.port}` : '';
}

// Ngôn ngữ gốc + các ngôn ngữ đã có bản dịch (kèm "dấu" = lần cập nhật bản dịch).
async function availableLangs(doc: FullDocument) {
  const sourceLang = detectLang(doc.title, doc.blocks ?? []);
  const rows = (await translationsReady()) ? await listTranslations(Number(doc.id)) : [];
  const langs = LANGS.filter((l) => l === sourceLang || rows.some((r) => r.lang === l));
  return { sourceLang, rows, langs };
}

function deckPath(doc: FullDocument, lang: Lang, stamp: string) {
  const dir = path.join(config.exportDir, doc.id);
  return { dir, prefix: `${lang}-`, file: path.join(dir, `${lang}-v${doc.version}-${stamp}.pptx`) };
}

const readMeta = (file: string): DeckMeta | null => {
  try {
    return { file, ...(JSON.parse(fs.readFileSync(`${file}.json`, 'utf8')) as { slides: number; bytes: number }) };
  } catch {
    return null;
  }
};

// Đang tạo dở -> người thứ hai bấm tải cùng lúc thì chờ chung, không tạo hai lần.
const building = new Map<string, Promise<DeckMeta>>();

export async function ensureDeck(doc: FullDocument, lang: Lang): Promise<DeckMeta> {
  const { sourceLang, rows } = await availableLangs(doc);
  const row = rows.find((r) => r.lang === lang);
  if (lang !== sourceLang && !row) throw new HttpError(404, 'Bài này chưa có bản dịch sang ngôn ngữ đã chọn');

  const stamp = lang === sourceLang ? 'src' : String(row!.updatedAt.getTime());
  const { dir, prefix, file } = deckPath(doc, lang, stamp);
  const ready = readMeta(file);
  if (ready && fs.existsSync(file)) return ready;

  const running = building.get(file);
  if (running) return running;

  const job = (async () => {
    const blocks = doc.blocks ?? [];
    const content = lang === sourceLang ? { title: doc.title, blocks } : mergeForRead({ title: doc.title, blocks }, row!);
    const author = doc.createdBy ? ((await findUserById(Number(doc.createdBy)))?.displayName ?? '') : '';
    const { data, slides } = await buildDeck({
      title: content.title,
      blocks: content.blocks,
      lang,
      author: author || doc.updatedBy?.displayName || '—',
      category: doc.category?.name ?? '',
      updatedAt: new Date(doc.updatedAt),
      version: doc.version,
      docUrl: `/docs/${doc.slug}${lang === sourceLang ? '' : `?lang=${lang}`}`,
      baseUrl: baseUrl(),
    });
    fs.mkdirSync(dir, { recursive: true });
    // Ghi ra file tạm rồi đổi tên: người khác không bao giờ tải phải file ghi dở.
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
    fs.writeFileSync(`${file}.json`, JSON.stringify({ slides, bytes: data.length }));
    // Xóa bản cũ của cùng ngôn ngữ.
    for (const old of fs.readdirSync(dir)) {
      const full = path.join(dir, old);
      if (old.startsWith(prefix) && full !== file && full !== `${file}.json`) fs.rmSync(full, { force: true });
    }
    return { file, slides, bytes: data.length };
  })();
  building.set(file, job);
  try {
    return await job;
  } finally {
    building.delete(file);
  }
}

export async function deckInfo(doc: FullDocument) {
  const { sourceLang, rows, langs } = await availableLangs(doc);
  return {
    sourceLang,
    items: langs.map((lang) => {
      const stamp = lang === sourceLang ? 'src' : String(rows.find((r) => r.lang === lang)!.updatedAt.getTime());
      const meta = readMeta(deckPath(doc, lang, stamp).file);
      return { lang, ready: !!meta, slides: meta?.slides ?? null, bytes: meta?.bytes ?? null };
    }),
  };
}

// Tạo sẵn ở nền, lần lượt từng file (tránh dồn nhiều việc nặng cùng lúc).
// Chỉ bài ĐÃ XUẤT BẢN; lỗi chỉ ghi log — người dùng bấm tải vẫn tạo lại được.
let queue: Promise<void> = Promise.resolve();
export function requestDeckExports(docId: number | string): void {
  queue = queue.then(async () => {
    try {
      const doc = await findDocumentById(Number(docId));
      if (!doc || doc.status !== 'published') return;
      for (const lang of (await availableLangs(doc)).langs) await ensureDeck(doc, lang);
    } catch (err) {
      console.error(`❌ PowerPoint bài #${docId}:`, err instanceof Error ? err.message : err);
    }
  });
}
