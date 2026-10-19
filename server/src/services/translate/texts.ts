// ============================================================
// services/translate/texts.ts — Lấy chữ cần dịch ra khỏi khối, và gắn bản dịch vào lại
// ============================================================
// Mỗi khối được "trải phẳng" thành { khóa: chữ }:
//   heading   { text }                 step      { title, text }
//   paragraph { text }                 callout   { text }
//   image     { alt, caption }         video     { caption }
//   diagram   { caption }              checklist { "i:<idMục>": chữ }
//   table     { "r<hàng>c<cột>": ô }  chart     { title, unit, "s<cột>": tên chuỗi, "l<hàng>": nhãn }
// Không dịch: mã lệnh, tên file đính kèm, đường dẫn, ô chỉ có số.
// Client có bản sao y hệt (client/src/features/translations/texts.ts) cho trang sửa bản dịch.

import { createHash } from 'node:crypto';
import type { ParsedBlock } from '../../blocks/schemas.ts';

export const LANGS = ['vi', 'en', 'ja'] as const;
export type Lang = (typeof LANGS)[number];

export type Texts = Record<string, string>;
type Props = Record<string, unknown>;

// Có chữ cái thì mới đáng dịch ("12", "2026-10-19", "---" thì không).
const worth = (s: unknown): s is string => typeof s === 'string' && /\p{L}/u.test(s);

export function extractTexts(block: ParsedBlock): Texts {
  const p = block.props as Props;
  const out: Texts = {};
  const put = (key: string, value: unknown) => {
    if (worth(value)) out[key] = value;
  };
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'callout':
      put('text', p.text);
      break;
    case 'step':
      put('title', p.title);
      put('text', p.text);
      break;
    case 'image':
      put('alt', p.alt);
      put('caption', p.caption);
      break;
    case 'video':
    case 'diagram':
      put('caption', p.caption);
      break;
    case 'checklist':
      for (const item of (p.items as { id: string; text: string }[]) ?? []) put(`i:${item.id}`, item.text);
      break;
    case 'table':
      ((p.rows as string[][]) ?? []).forEach((row, r) => row.forEach((cell, c) => put(`r${r}c${c}`, cell)));
      break;
    case 'chart': {
      put('title', p.title);
      put('unit', p.unit);
      const rows = (p.rows as string[][]) ?? [];
      (rows[0] ?? []).forEach((name, c) => c > 0 && put(`s${c}`, name));
      rows.forEach((row, r) => r > 0 && put(`l${r}`, row[0]));
      break;
    }
  }
  return out;
}

// Gắn chữ đã dịch vào một BẢN SAO của khối (không sửa khối gốc).
// Khóa nào không có trong `texts` thì giữ nguyên chữ cũ.
export function applyTexts(block: ParsedBlock, texts: Texts): ParsedBlock {
  const p = structuredClone(block.props) as Props;
  const pick = (key: string, current: unknown) => (typeof texts[key] === 'string' ? texts[key] : current);
  for (const key of ['text', 'title', 'alt', 'caption', 'unit']) {
    if (key in p) p[key] = pick(key, p[key]);
  }
  if (block.type === 'checklist') {
    p.items = ((p.items as { id: string; text: string }[]) ?? []).map((item) => ({ ...item, text: pick(`i:${item.id}`, item.text) }));
  }
  if (block.type === 'table') {
    p.rows = ((p.rows as string[][]) ?? []).map((row, r) => row.map((cell, c) => pick(`r${r}c${c}`, cell)));
  }
  if (block.type === 'chart') {
    p.rows = ((p.rows as string[][]) ?? []).map((row, r) =>
      row.map((cell, c) => (r === 0 && c > 0 ? pick(`s${c}`, cell) : r > 0 && c === 0 ? pick(`l${r}`, cell) : cell)),
    );
  }
  return { ...block, props: p };
}

// "Dấu vân tay" của khối gốc: đổi BẤT KỲ thứ gì (chữ, ảnh, loại khối) là đổi dấu.
export const blockHash = (block: ParsedBlock) => createHash('sha1').update(JSON.stringify([block.type, block.props])).digest('hex');
export const titleHash = (title: string) => createHash('sha1').update(`title:${title}`).digest('hex');
export const TITLE_KEY = '__title';

// ---------- Nhận ra ngôn ngữ gốc ----------
// Chỉ phân biệt 3 ngôn ngữ của web, nên nhìn CHỮ VIẾT là đủ chắc chắn:
//   có nhiều kana / kanji          -> tiếng Nhật
//   chữ Latin có dấu tiếng Việt    -> tiếng Việt
//   còn lại                         -> tiếng Anh
// (Làm ở server: tức thì, không tốn lượt Claude, và người đọc biết ngay bài gốc là tiếng gì.)
const VIET = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹàáèéìíòóùúýãõũĩ]/giu;

export function detectLang(title: string, blocks: ParsedBlock[]): Lang {
  const text = [title, ...blocks.flatMap((b) => Object.values(extractTexts(b)))].join(' ').slice(0, 20_000);
  const japanese = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu) ?? []).length;
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  if (japanese > 0 && japanese >= (japanese + latin) * 0.15) return 'ja';
  const viet = (text.match(VIET) ?? []).length;
  if (latin === 0) return 'vi';
  return viet / latin > 0.02 ? 'vi' : 'en';
}
