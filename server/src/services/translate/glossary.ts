// ============================================================
// services/translate/glossary.ts — Bảng thuật ngữ lấy từ chính giao diện web
// ============================================================
// Bài viết hay nhắc tên nút: bấm "Bỏ đánh dấu", bấm **Lưu**... Máy dịch tự do
// có thể ra 「チェックを外す」 trong khi nút tiếng Nhật thật ghi 「クリア」.
// -> Lấy chữ giao diện 3 ngôn ngữ (client/src/i18n) làm bảng đối chiếu, gửi kèm
//    lời dặn những cặp CÓ XUẤT HIỆN trong đoạn cần dịch.
//
// Chỉ khớp chữ nằm trong ngoặc kép / in đậm / 「」 (cách bài viết hay ghi tên nút):
// khớp trần sẽ bắt nhầm, vd nút "Lưu" nằm trong chữ "Lưu ý".

import { en } from '../../../../client/src/i18n/en.ts';
import { ja } from '../../../../client/src/i18n/ja.ts';
import { vi } from '../../../../client/src/i18n/vi.ts';
import type { Lang } from './texts.ts';

type Entry = Record<Lang, string>;

function flatten(obj: unknown, prefix: string, out: Map<string, string>) {
  if (typeof obj === 'string') out.set(prefix, obj);
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
}

// Nhãn ngắn (tên nút, menu, tiêu đề mục) — bỏ câu dài và chữ có chỗ chèn {{...}}.
function buildEntries(): Entry[] {
  const maps = { vi: new Map<string, string>(), en: new Map<string, string>(), ja: new Map<string, string>() };
  flatten(vi, '', maps.vi);
  flatten(en, '', maps.en);
  flatten(ja, '', maps.ja);
  const entries: Entry[] = [];
  for (const [key, viText] of maps.vi) {
    const enText = maps.en.get(key);
    const jaText = maps.ja.get(key);
    if (!enText || !jaText) continue;
    const texts = [viText, enText, jaText];
    if (texts.some((t) => t.includes('{{') || t.length < 2 || t.length > 40 || /[.。!?！？]$/.test(t))) continue;
    entries.push({ vi: viText, en: enText, ja: jaText });
  }
  return entries;
}

let cache: Entry[] | null = null;
const entries = () => (cache ??= buildEntries());

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Các cặp thuật ngữ cần dùng cho đoạn chữ này (tối đa `max`).
export function glossaryFor(text: string, from: Lang, to: Lang, max = 60): [string, string][] {
  const found = new Map<string, string>();
  for (const e of entries()) {
    if (found.size >= max) break;
    const label = e[from];
    if (found.has(label) || e[to] === label) continue;
    // "Nhãn" / “Nhãn” / **Nhãn** / 「Nhãn」
    const re = new RegExp(`(["“「]|\\*\\*)${escapeRe(label)}(["”」]|\\*\\*)`);
    if (re.test(text)) found.set(label, e[to]);
  }
  return [...found];
}
