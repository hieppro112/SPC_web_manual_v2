// ============================================================
// services/translate/prompt.ts — Lời dặn + khuôn JSON gửi Claude để dịch
// ============================================================
// Gửi đi:  { items: [{ id, texts: { khóa: chữ } }] }   (id = id khối, hoặc "__title")
// Nhận về: { items: [{ id, texts: [{ key, text }] }] }  (mảng thay cho object khóa động,
//                                                        vì khuôn JSON schema cần biết trước tên field)
// Bài dài được chia nhiều phần (mỗi phần một lần gọi Claude), giống nhập PowerPoint.

import { glossaryFor } from './glossary.ts';
import type { Lang, Texts } from './texts.ts';

export type TranslateItem = { id: string; texts: Texts };
export type TranslatePart = { lang: Lang; system: string; prompt: string; schema: object };

const LANG_NAME: Record<Lang, string> = { vi: 'Vietnamese', en: 'English', ja: 'Japanese' };

const STYLE: Record<Lang, string> = {
  vi: 'Natural, clear Vietnamese as used in internal IT manuals.',
  en: 'Plain, concise English.',
  ja: 'Natural business Japanese (です・ます調). Use katakana for common IT loanwords.',
};

export const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          texts: {
            type: 'array',
            items: { type: 'object', properties: { key: { type: 'string' }, text: { type: 'string' } }, required: ['key', 'text'] },
          },
        },
        required: ['id', 'texts'],
      },
    },
  },
  required: ['items'],
};

function systemPrompt(from: Lang, to: Lang, glossary: [string, string][]): string {
  const terms = glossary.length
    ? [
        `- These are the website's own button / menu labels. When the text refers to one of them (usually in quotes or bold), use EXACTLY this ${LANG_NAME[to]} label:`,
        ...glossary.map(([a, b]) => `  "${a}" => "${b}"`),
      ]
    : [];
  return [
    `You translate an internal IT documentation website (KVH, a Japanese–Vietnamese manufacturing company) from ${LANG_NAME[from]} to ${LANG_NAME[to]}.`,
    'Rules:',
    '- Translate faithfully. Do not add, remove, summarize or explain anything.',
    '- Keep Markdown exactly: **bold**, *italic*, `code`, [link text](url) (translate the link text, keep the url), list markers "- " and "1. ", line breaks.',
    '- Do NOT translate: text inside backticks, URLs, file paths, commands, IP addresses, server/computer names, error codes, model numbers, product and software names (Windows, Outlook, Excel, SAP, VPN...).',
    '- Button and menu names of English software stay in English exactly as shown on screen.',
    '- Keep numbers, units, dates and symbols unchanged.',
    `- Style: ${STYLE[to]}`,
    '- Some texts may already be in the target language or be names only: return them unchanged.',
    '- Return EVERY item id and EVERY key exactly as given, one translated text per key.',
    ...terms,
  ].join('\n');
}

// Chia các mục thành từng phần không quá maxChars ký tự (tính theo JSON gửi đi).
export function buildParts(from: Lang, to: Lang, items: TranslateItem[], maxChars: number): TranslatePart[] {
  const groups: TranslateItem[][] = [];
  let current: TranslateItem[] = [];
  let size = 0;
  for (const item of items) {
    const len = JSON.stringify(item).length;
    if (current.length && (size + len > maxChars || current.length >= 60)) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += len;
  }
  if (current.length) groups.push(current);

  return groups.map((group) => ({
    lang: to,
    system: systemPrompt(from, to, glossaryFor(group.flatMap((i) => Object.values(i.texts)).join('\n'), from, to)),
    prompt: `Translate every text below from ${LANG_NAME[from]} to ${LANG_NAME[to]}.\n\n${JSON.stringify({ items: group })}`,
    schema: TRANSLATE_SCHEMA,
  }));
}

// Kết quả của Claude -> { idMục: { khóa: chữ } }. Chỉ nhận đúng khóa đã gửi, chữ không rỗng,
// không dài bất thường (chặn kết quả hỏng làm vỡ bài).
export function readOutput(output: unknown, sent: Map<string, Texts>): Map<string, Texts> {
  const result = new Map<string, Texts>();
  const items = (output as { items?: unknown })?.items;
  if (!Array.isArray(items)) return result;
  for (const item of items as { id?: unknown; texts?: unknown }[]) {
    const source = typeof item?.id === 'string' ? sent.get(item.id) : undefined;
    if (!source || !Array.isArray(item.texts)) continue;
    const texts: Texts = {};
    for (const t of item.texts as { key?: unknown; text?: unknown }[]) {
      if (typeof t?.key !== 'string' || typeof t.text !== 'string' || !(t.key in source)) continue;
      const text = t.text.trim() ? t.text : '';
      if (text && text.length <= source[t.key].length * 4 + 200) texts[t.key] = text;
    }
    result.set(item.id as string, { ...(result.get(item.id as string) ?? {}), ...texts });
  }
  return result;
}
