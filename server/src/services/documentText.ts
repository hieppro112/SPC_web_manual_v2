// ============================================================
// services/documentText.ts — Tính mô tả ngắn + chữ dùng để tìm kiếm
// ============================================================
// Hồi dùng MongoDB, việc này nằm trong hook pre('save') của Mongoose.
// SQL Server không có hook như vậy, nên tách thành hàm thuần (không đụng
// DB): nhận khối vào, trả chuỗi ra. Mọi đường lưu tài liệu đều gọi hàm này.

import { removeDiacritics } from '../utils/slugify.ts';

type BlockLike = { type?: string; props?: unknown };

// Đọc field `text` trong props một cách an toàn (props là unknown).
function getText(props: unknown): string {
  if (props && typeof props === 'object' && 'text' in props && typeof props.text === 'string') {
    return props.text;
  }
  return '';
}

// Bỏ ký hiệu Markdown để thành chữ thuần:
// "[xem tại đây](http://...)" -> "xem tại đây", "**đậm**" -> "đậm",
// "- mục" / "1. mục" ở đầu dòng -> "mục"
function stripMarkdown(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .trim();
}

// Mô tả ngắn = khối văn bản đầu tiên có nội dung (tối đa ~160 ký tự).
export function buildDesc(blocks: BlockLike[]): string {
  const first = blocks.find((b) => (b.type === 'paragraph' || b.type === 'step') && getText(b.props).trim());
  const text = stripMarkdown(getText(first?.props)).replace(/\s+/g, ' ');
  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

// Gom MỌI chuỗi chữ trong props (text, title, caption, ô bảng, mục
// checklist...), bỏ qua các field không phải nội dung đọc được.
const NON_TEXT_KEYS = new Set(['id', 'src', 'image', 'variant', 'language']);
function collectText(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectText(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (!NON_TEXT_KEYS.has(key)) collectText(v, out);
    }
  }
}

// Toàn bộ chữ của bài, bỏ dấu + chữ thường: gõ "bao tri" vẫn ra "Bảo trì".
export function buildSearchText(title: string, blocks: BlockLike[]): string {
  const parts = [title];
  blocks.forEach((b) => collectText(b.props, parts));
  return removeDiacritics(stripMarkdown(parts.join(' '))).replace(/\s+/g, ' ');
}
