// ============================================================
// features/translations/texts.ts — Phần chữ dịch được của một khối
// ============================================================
// BẢN SAO của extractTexts() ở server/src/services/translate/texts.ts —
// sửa bên này thì sửa cả bên kia (khóa phải trùng thì server mới nhận bản sửa tay).

import type { TFunction } from 'i18next';
import type { Block } from '../../blocks/types.ts';

export type Texts = Record<string, string>;

const worth = (s: unknown): s is string => typeof s === 'string' && /\p{L}/u.test(s);

export function extractTexts(block: Block): Texts {
  const out: Texts = {};
  const put = (key: string, value: unknown) => {
    if (worth(value)) out[key] = value;
  };
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'callout':
      put('text', block.props.text);
      break;
    case 'step':
      put('title', block.props.title);
      put('text', block.props.text);
      break;
    case 'image':
      put('alt', block.props.alt);
      put('caption', block.props.caption);
      break;
    case 'video':
    case 'diagram':
      put('caption', block.props.caption);
      break;
    case 'checklist':
      for (const item of block.props.items ?? []) put(`i:${item.id}`, item.text);
      break;
    case 'table':
      (block.props.rows ?? []).forEach((row, r) => row.forEach((cell, c) => put(`r${r}c${c}`, cell)));
      break;
    case 'chart': {
      put('title', block.props.title);
      put('unit', block.props.unit);
      const rows = block.props.rows ?? [];
      (rows[0] ?? []).forEach((name, c) => c > 0 && put(`s${c}`, name));
      rows.forEach((row, r) => r > 0 && put(`l${r}`, row[0]));
      break;
    }
  }
  return out;
}

const FIELDS = ['text', 'title', 'alt', 'caption', 'unit'] as const;

// Khóa -> nhãn dễ hiểu trên trang sửa bản dịch ("r2c1" -> "Hàng 3 · Cột 2").
export function keyLabel(key: string, t: TFunction): string {
  const cell = key.match(/^r(\d+)c(\d+)$/);
  if (cell) return t('translation.keys.cell', { r: Number(cell[1]) + 1, c: Number(cell[2]) + 1 });
  if (key.startsWith('i:')) return t('translation.keys.item');
  if (/^s\d+$/.test(key)) return t('translation.keys.series', { n: key.slice(1) });
  if (/^l\d+$/.test(key)) return t('translation.keys.label', { n: key.slice(1) });
  const field = FIELDS.find((f) => f === key);
  return field ? t(`translation.keys.${field}`) : key;
}
