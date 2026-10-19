// ============================================================
// services/ai/docText.ts — Đổi tài liệu (mảng khối) thành chữ cho AI đọc
// ============================================================
// AI không "nhìn" được giao diện, nên mỗi khối được viết lại thành Markdown:
// bảng -> bảng Markdown, biểu đồ -> bảng số liệu, sơ đồ -> chữ trên các hình...
//
// Tài liệu được chia thành các MỤC (theo khối Tiêu đề mục / Bước). Mỗi mục
// có anchor giống hệt trang đọc (#chuan-bi, #buoc-2) để AI gắn link nguồn
// nhảy đúng chỗ.

import type { ParsedBlock } from '../../blocks/schemas.ts';
import { removeDiacritics } from '../../utils/slugify.ts';
import { diagramLabels } from '../documentText.ts';

export type DocLike = { slug: string; title: string; blocks?: ParsedBlock[] };
export type DocSection = { anchor: string | null; heading: string; text: string };

// PHẢI giống slugify() + computeBlockMeta() ở client (client/src/blocks/meta.ts),
// nếu không link AI đưa ra sẽ không nhảy đúng mục.
function anchorSlug(input: string): string {
  return removeDiacritics(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const CALLOUT_LABEL: Record<string, string> = { info: 'Thông tin', success: 'Mẹo', warning: 'Lưu ý', danger: 'Cảnh báo' };

function markdownTable(rows: string[][], header: boolean): string {
  const clean = rows.filter((r) => r.some((c) => c.trim()));
  if (!clean.length) return '';
  const width = Math.max(...clean.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => (r[i] ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`;
  const sep = `| ${Array(width).fill('---').join(' | ')} |`;
  return header ? [line(clean[0]), sep, ...clean.slice(1).map(line)].join('\n') : [line(Array(width).fill('')), sep, ...clean.map(line)].join('\n');
}

// Một khối -> đoạn Markdown ('' = khối không có chữ, bỏ qua).
function blockText(block: ParsedBlock): string {
  const p = block.props as Record<string, unknown>;
  switch (block.type) {
    case 'paragraph':
      return str(p.text);
    case 'image':
      return str(p.caption) || str(p.alt) ? `[Ảnh: ${str(p.caption) || str(p.alt)}]` : '';
    case 'video':
      return str(p.caption) ? `[Video: ${str(p.caption)}]` : '';
    case 'file':
      return str(p.name) ? `[File đính kèm: ${str(p.name)}]` : '';
    case 'table':
      return markdownTable((p.rows as string[][]) ?? [], p.header !== false);
    case 'callout':
      return str(p.text) ? `> **${CALLOUT_LABEL[String(p.variant)] ?? 'Lưu ý'}:** ${str(p.text).replace(/\n/g, '\n> ')}` : '';
    case 'code':
      return str(p.code) ? `\`\`\`${str(p.language)}\n${String(p.code)}\n\`\`\`` : '';
    case 'checklist':
      return ((p.items as { text: string }[]) ?? [])
        .map((i) => str(i.text))
        .filter(Boolean)
        .map((t) => `- [ ] ${t}`)
        .join('\n');
    case 'diagram': {
      const labels = diagramLabels(str(p.xml));
      if (!labels.length && !str(p.caption)) return '';
      return `[Sơ đồ${str(p.caption) ? `: ${str(p.caption)}` : ''}]${labels.length ? ` Các hình trong sơ đồ: ${labels.join('; ')}` : ''}`;
    }
    case 'chart': {
      const table = markdownTable((p.rows as string[][]) ?? [], true);
      if (!table) return '';
      const unit = str(p.unit) ? ` (đơn vị: ${str(p.unit)})` : '';
      return `[Biểu đồ: ${str(p.title) || 'không tên'}${unit}]\n${table}`;
    }
    default:
      return ''; // heading / step xử lý riêng; divider không có chữ
  }
}

// Anchor của từng khối tiêu đề / bước, tính y như trang đọc: { idKhối: "chuan-bi" }.
function anchorMap(blocks: ParsedBlock[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  const unique = (base: string) => {
    let anchor = base || 'muc';
    for (let i = 2; used.has(anchor); i++) anchor = `${base}-${i}`;
    used.add(anchor);
    return anchor;
  };
  let step = 0;
  for (const block of blocks) {
    const p = block.props as Record<string, unknown>;
    if (block.type === 'heading' && str(p.text)) map.set(block.id, unique(anchorSlug(str(p.text))));
    else if (block.type === 'step') map.set(block.id, unique(`buoc-${++step}`));
  }
  return map;
}

// anchorSource: khi đọc BẢN DỊCH, lấy anchor từ khối cùng id của bài gốc
// (tiêu đề tiếng Nhật không ra được anchor "#chuan-bi" như trang đọc).
export function docSections(doc: DocLike, anchorSource?: ParsedBlock[]): DocSection[] {
  const sections: DocSection[] = [{ anchor: null, heading: doc.title, text: '' }];
  const fromSource = anchorSource ? anchorMap(anchorSource) : null;
  const used = new Set<string>();
  const uniqueAnchor = (base: string) => {
    let anchor = base || 'muc';
    for (let i = 2; used.has(anchor); i++) anchor = `${base}-${i}`;
    used.add(anchor);
    return anchor;
  };
  let step = 0;

  for (const block of doc.blocks ?? []) {
    const p = block.props as Record<string, unknown>;
    if (block.type === 'heading' && str(p.text)) {
      const anchor = fromSource?.get(block.id) ?? uniqueAnchor(anchorSlug(str(p.text)));
      sections.push({ anchor, heading: str(p.text), text: '' });
    } else if (block.type === 'step') {
      step++;
      const title = str(p.title);
      const anchor = fromSource?.get(block.id) ?? uniqueAnchor(`buoc-${step}`);
      // Bản dịch: không ghi chữ "Bước" tiếng Việt vào tiêu đề mục.
      const heading = anchorSource ? `${step}. ${title}`.trim() : `Bước ${step}${title ? `: ${title}` : ''}`;
      sections.push({ anchor, heading, text: str(p.text) });
    } else {
      const text = blockText(block);
      if (text) {
        const current = sections[sections.length - 1];
        current.text = current.text ? `${current.text}\n\n${text}` : text;
      }
    }
  }
  return sections;
}

export const sectionUrl = (slug: string, anchor: string | null) => `/docs/${slug}${anchor ? `#${anchor}` : ''}`;

// Cả tài liệu thành một văn bản Markdown, mỗi mục ghi kèm URL để AI trích nguồn.
export function docMarkdown(doc: DocLike, withUrls = true): string {
  const parts = [`# ${doc.title}${withUrls ? `\n(URL: ${sectionUrl(doc.slug, null)})` : ''}`];
  docSections(doc).forEach((s, i) => {
    if (i === 0) {
      if (s.text) parts.push(s.text);
      return;
    }
    if (!s.text && !s.heading) return;
    parts.push(`## ${s.heading}${withUrls ? `\n(URL: ${sectionUrl(doc.slug, s.anchor)})` : ''}${s.text ? `\n${s.text}` : ''}`);
  });
  return parts.join('\n\n');
}
