// ============================================================
// services/translate/engine.ts — Tính việc cần dịch, ghép kết quả, ghép bản để đọc
// ============================================================
//   planTranslation()  — bài gốc + bản dịch đã có -> khối nào cần (gửi Claude) dịch
//   applyTranslation() — kết quả Claude -> lưu bản dịch mới (giữ khối không đổi / đã sửa tay)
//   mergeForRead()     — ghép bản để đọc theo cấu trúc HIỆN TẠI của bài gốc
//
// Mọi bước so khối bằng "dấu vân tay" (blockHash): khối gốc không đổi thì
// dùng lại bản dịch cũ, nên sửa một đoạn chỉ tốn công dịch đúng đoạn đó.

import type { ParsedBlock } from '../../blocks/schemas.ts';
import { deleteTranslation, saveTranslation, type TranslationRow } from '../../repositories/translations.ts';
import { buildDesc, buildSearchText } from '../documentText.ts';
import { buildParts, readOutput, type TranslateItem, type TranslatePart } from './prompt.ts';
import { LANGS, TITLE_KEY, applyTexts, blockHash, detectLang, extractTexts, titleHash, type Lang, type Texts } from './texts.ts';

export type SourceDoc = { id: number; version: number; title: string; blocks: ParsedBlock[] };

type Target = { lang: Lang; existing: TranslationRow | undefined; items: TranslateItem[] };
export type Plan = { doc: SourceDoc; sourceLang: Lang; targets: Target[] };

const existingBlock = (row: TranslationRow | undefined, id: string) => row?.blocks.find((b) => b.id === id);

// Một khối có thể dùng lại bản dịch cũ không?
function reusable(row: TranslationRow | undefined, block: ParsedBlock, force: boolean): boolean {
  return !force && !!row && row.hashes[block.id] === blockHash(block) && !!existingBlock(row, block.id);
}

export function planTranslation(doc: SourceDoc, rows: TranslationRow[], force: boolean): Plan {
  const sourceLang = detectLang(doc.title, doc.blocks);
  const targets = LANGS.filter((l) => l !== sourceLang).map((lang): Target => {
    const existing = rows.find((r) => r.lang === lang);
    const items: TranslateItem[] = [];
    const titleOk = !force && existing?.hashes[TITLE_KEY] === titleHash(doc.title);
    if (!titleOk && /\p{L}/u.test(doc.title)) items.push({ id: TITLE_KEY, texts: { title: doc.title } });
    for (const block of doc.blocks) {
      const texts = extractTexts(block);
      if (Object.keys(texts).length && !reusable(existing, block, force)) items.push({ id: block.id, texts });
    }
    return { lang, existing, items };
  });
  return { doc, sourceLang, targets };
}

export const planHasWork = (plan: Plan) => plan.targets.some((t) => t.items.length > 0);

export function planParts(plan: Plan, maxChars: number): TranslatePart[] {
  return plan.targets.flatMap((t) => (t.items.length ? buildParts(plan.sourceLang, t.lang, t.items, maxChars) : []));
}

// Ghép + lưu. outputs: kết quả từng phần kèm ngôn ngữ. Trả về số mục CHƯA dịch được
// (Claude bỏ sót) — > 0 thì nơi gọi cho thử lại.
export async function applyTranslation(plan: Plan, outputs: { lang: string; output: unknown }[], force: boolean): Promise<number> {
  let missing = 0;
  for (const target of plan.targets) {
    const sent = new Map(target.items.map((i) => [i.id, i.texts]));
    const got = new Map<string, Texts>();
    for (const o of outputs.filter((x) => x.lang === target.lang)) {
      for (const [id, texts] of readOutput(o.output, sent)) got.set(id, { ...(got.get(id) ?? {}), ...texts });
    }
    // Đủ MỌI khóa mới coi là dịch xong khối đó (thiếu khóa nào -> lần sau dịch lại cả khối).
    const complete = (id: string) => {
      const want = sent.get(id);
      const have = got.get(id);
      return !!want && !!have && Object.keys(want).every((k) => k in have);
    };

    const hashes: Record<string, string> = {};
    const blocks = plan.doc.blocks.map((block) => {
      const hash = blockHash(block);
      if (!sent.has(block.id)) {
        // Không cần dịch: khối không có chữ (ảnh, mã lệnh...) hoặc dùng lại bản cũ.
        hashes[block.id] = hash;
        return reusable(target.existing, block, force) ? existingBlock(target.existing, block.id)! : block;
      }
      if (complete(block.id)) {
        hashes[block.id] = hash;
        return applyTexts(block, got.get(block.id)!);
      }
      missing++;
      hashes[block.id] = ''; // để chữ gốc, đánh dấu "chưa dịch"
      return block;
    });

    let title = plan.doc.title;
    if (!sent.has(TITLE_KEY)) {
      hashes[TITLE_KEY] = titleHash(plan.doc.title);
      title = target.existing && target.existing.hashes[TITLE_KEY] === hashes[TITLE_KEY] && !force ? target.existing.title : plan.doc.title;
    } else if (complete(TITLE_KEY)) {
      hashes[TITLE_KEY] = titleHash(plan.doc.title);
      title = got.get(TITLE_KEY)!.title;
    } else {
      missing++;
      hashes[TITLE_KEY] = '';
    }

    await saveTranslation({
      documentId: plan.doc.id,
      lang: target.lang,
      sourceLang: plan.sourceLang,
      sourceVersion: plan.doc.version,
      title,
      desc: buildDesc(blocks),
      blocks,
      hashes,
      searchText: buildSearchText(title, blocks),
      clearEdit: force,
    });
  }
  // Bài gốc giờ là ngôn ngữ X -> bản dịch sang X (nếu có từ trước) không còn ý nghĩa.
  await deleteTranslation(plan.doc.id, plan.sourceLang);
  return missing;
}

// ---------- Ghép bản để ĐỌC ----------
// Luôn theo cấu trúc HIỆN TẠI của bài gốc: khối đã dịch (dấu khớp) thì lấy bản dịch,
// khối mới / vừa sửa chưa kịp dịch thì tạm hiện chữ gốc. Cùng id khối -> mục lục,
// link "#buoc-2" của bài gốc dùng được ở bản dịch.
export function mergeForRead(doc: { title: string; blocks: ParsedBlock[] }, row: TranslationRow) {
  const translatedIds: string[] = [];
  let untranslated = 0;
  const blocks = doc.blocks.map((block) => {
    if (!Object.keys(extractTexts(block)).length) return block;
    const done = row.hashes[block.id] === blockHash(block) ? existingBlock(row, block.id) : undefined;
    if (done) {
      translatedIds.push(block.id);
      return done;
    }
    untranslated++;
    return block;
  });
  const titleDone = row.hashes[TITLE_KEY] === titleHash(doc.title);
  if (!titleDone) untranslated++;
  return { title: titleDone ? row.title : doc.title, blocks, translatedIds, untranslated };
}
