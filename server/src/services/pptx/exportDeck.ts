// ============================================================
// services/pptx/exportDeck.ts — Bài viết -> file PowerPoint (không dùng AI)
// ============================================================
// Chiều ngược lại của importPrompt.ts. Bài viết đã có cấu trúc khối rõ ràng
// nên code tự dựng slide, không cần nhờ Claude: nhanh, miễn phí, lần nào
// cũng ra giống nhau, bám sát 100% nội dung.
//
//   Bìa (tên bài, người soạn, ngày)
//   heading cấp 2   -> slide mở chương (nền xanh)
//   heading cấp 3   -> tiêu đề cho các slide nội dung tiếp theo
//   đoạn văn / lưu ý / checklist / mã lệnh -> xếp chồng trên slide nội dung,
//                      tràn thì sang slide "(tiếp)"
//   bước, ảnh, bảng, biểu đồ, sơ đồ, video -> mỗi khối một slide riêng
//   file đính kèm   -> gom vào slide cuối "Tệp đính kèm"
//
// Mẫu slide tạm lấy logo + màu từ file PowerPoint đào tạo của công ty
// (logo: server/assets/pptx/logo.png). Có file mẫu chính thức thì sửa BRAND.
//
// An toàn: ảnh chỉ đọc từ thư mục upload của chính server (không tải URL
// ngoài), và luôn đổi qua sharp sang PNG/JPEG trước khi đưa vào PowerPoint.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pptxgenModule from 'pptxgenjs';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { config } from '../../config.ts';
import type { ParsedBlock } from '../../blocks/schemas.ts';

// pptxgenjs khai báo kiểu theo CommonJS (class nằm ở `.default`) nhưng Node lại
// nạp bản ESM (bản thân module đã là class) -> lấy đúng class cho cả hai trường hợp.
type PptxClass = typeof pptxgenModule.default;
const PptxGenJS: PptxClass = (pptxgenModule as unknown as { default?: PptxClass }).default ?? (pptxgenModule as unknown as PptxClass);
type Slide = import('pptxgenjs').default.Slide;
type TextProps = import('pptxgenjs').default.TextProps;
type TextOpts = import('pptxgenjs').default.TextPropsOptions;
type TableRow = import('pptxgenjs').default.TableRow;
type ChartName = import('pptxgenjs').default.CHART_NAME;

export type DeckLang = 'vi' | 'en' | 'ja';

export type DeckInput = {
  title: string;
  blocks: ParsedBlock[];
  lang: DeckLang;
  author: string;
  category: string;
  updatedAt: Date;
  version: number;
  docUrl: string; // link tới bài trên web (tuyệt đối nếu biết địa chỉ máy chủ)
  baseUrl: string; // '' = không biết địa chỉ máy chủ -> không tạo được link / QR tuyệt đối
};

// ---------- Nhận diện + bố cục ----------
const BRAND = {
  blue: '0050A0',
  yellow: 'F0C800',
  text: '1F2937',
  muted: '6B7280',
  font: 'Calibri',
  mono: 'Consolas',
};
const LOGO = fs.readFileSync(new URL('../../../assets/pptx/logo.png', import.meta.url));
const LOGO_RATIO = 927 / 244; // rộng / cao của logo

// Slide 16:9 (LAYOUT_WIDE) = 13,333 x 7,5 inch. Vùng nội dung bên dưới tiêu đề:
const W = 13.333;
const BX = 0.6;
const BY = 1.4;
const BW = W - 2 * BX;
const BH = 5.35;
const GAP = 0.15;

const LABELS: Record<DeckLang, Record<string, string>> = {
  vi: {
    step: 'Bước', cont: '(tiếp)', author: 'Người soạn', updated: 'Cập nhật', category: 'Thể loại',
    language: 'Ngôn ngữ', langName: 'Tiếng Việt', version: 'Phiên bản', video: 'Video',
    scan: 'Quét mã QR bằng điện thoại để xem video', files: 'Tệp đính kèm', original: 'Bản đầy đủ trên web',
    info: 'Lưu ý', success: 'Mẹo', warning: 'Cảnh báo', danger: 'Nguy hiểm', noImage: 'Không tìm thấy ảnh',
  },
  en: {
    step: 'Step', cont: '(cont.)', author: 'Author', updated: 'Updated', category: 'Category',
    language: 'Language', langName: 'English', version: 'Version', video: 'Video',
    scan: 'Scan the QR code with your phone to watch the video', files: 'Attachments', original: 'Full version on the web',
    info: 'Note', success: 'Tip', warning: 'Warning', danger: 'Danger', noImage: 'Image not found',
  },
  ja: {
    step: 'ステップ', cont: '(続き)', author: '作成者', updated: '更新日', category: 'カテゴリ',
    language: '言語', langName: '日本語', version: 'バージョン', video: '動画',
    scan: 'スマートフォンでQRコードを読み取ると動画を再生できます', files: '添付ファイル', original: 'Web版（全文）',
    info: '注意', success: 'ヒント', warning: '警告', danger: '危険', noImage: '画像が見つかりません',
  },
};

const CALLOUT_COLORS = {
  info: { fill: 'E8F1FB', bar: '0050A0' },
  success: { fill: 'E8F6EC', bar: '2E7D32' },
  warning: { fill: 'FFF6D6', bar: 'E0A800' },
  danger: { fill: 'FDECEC', bar: 'C62828' },
} as const;

// ---------- Chữ: Markdown đơn giản -> các "run" của PowerPoint ----------
type Run = TextProps;

// Chữ Nhật/Hán chiếm gần gấp đôi bề ngang chữ Latin -> tính là 2 ký tự.
function visualLength(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += (c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef) ? 2 : 1;
  }
  return n;
}

// Số dòng ước tính khi xuống dòng tự động trong khung rộng `width` inch.
function lineCount(lines: string[], fontSize: number, width: number): number {
  // Calibri: bề rộng trung bình một ký tự ≈ 0,0065 inch × cỡ chữ (18pt ≈ 0,117 inch).
  const perLine = Math.max(10, Math.floor(width / (fontSize * 0.0065)));
  return lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(visualLength(l) / perLine)), 0);
}
const lineHeight = (fontSize: number) => fontSize * 0.0185; // inch: dòng 1,2 × cỡ chữ + khoảng cách đoạn

function absUrl(url: string, baseUrl: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && baseUrl) return `${baseUrl}${url}`;
  return null;
}

// **đậm**, *nghiêng*, `mã`, [chữ](link) trong một dòng.
function inlineRuns(line: string, opts: TextOpts, baseUrl: string): Run[] {
  const runs: Run[] = [];
  for (const part of line.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) runs.push({ text: part.slice(2, -2), options: { ...opts, bold: true } });
    else if (part.startsWith('`') && part.endsWith('`')) runs.push({ text: part.slice(1, -1), options: { ...opts, fontFace: BRAND.mono } });
    else if (part.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)!;
      const url = absUrl(m[2], baseUrl);
      runs.push({ text: m[1], options: url ? { ...opts, hyperlink: { url }, color: BRAND.blue } : opts });
    } else if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) runs.push({ text: part.slice(1, -1), options: { ...opts, italic: true } });
    else runs.push({ text: part, options: opts });
  }
  return runs.length ? runs : [{ text: ' ', options: opts }];
}

// Một đoạn Markdown (nhiều dòng) -> mảng run, mỗi dòng là một đoạn PowerPoint.
// "- " / "* " -> gạch đầu dòng, "1. " -> đánh số; thụt 2 dấu cách = lùi một cấp.
function markdownRuns(lines: string[], base: TextOpts, baseUrl: string): Run[] {
  const runs: Run[] = [];
  for (const raw of lines) {
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(raw);
    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(raw);
    let opts: TextOpts = { ...base };
    let text = raw.trim();
    if (bullet) {
      opts = { ...opts, bullet: true, indentLevel: Math.floor(bullet[1].length / 2) };
      text = bullet[2];
    } else if (numbered) {
      opts = { ...opts, bullet: { type: 'number' }, indentLevel: Math.floor(numbered[1].length / 2) };
      text = numbered[2];
    }
    const lineRuns = inlineRuns(text, opts, baseUrl);
    lineRuns[lineRuns.length - 1].options = { ...lineRuns[lineRuns.length - 1].options, breakLine: true };
    runs.push(...lineRuns);
  }
  return runs;
}

// Chia các dòng thành từng cụm vừa chiều cao `maxH` (đoạn quá dài -> nhiều slide).
function chunkLines(lines: string[], fontSize: number, width: number, maxH: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (current.length && lineCount([...current, line], fontSize, width) * lineHeight(fontSize) > maxH) {
      chunks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// Chiều cao ước tính của bảng rộng `w`: mỗi dòng cao bằng ô nhiều chữ nhất.
function tableHeight(cells: string[][], cols: number, w: number, fontSize: number): number {
  const colW = w / cols - 0.1;
  return cells.reduce((sum, row) => sum + Math.max(...row.map((c) => lineCount(c.split('\n'), fontSize, colW))) * lineHeight(fontSize) + 0.12, 0);
}

const splitLines = (text: string) => text.replace(/\r/g, '').split('\n').filter((l, i, all) => l.trim() || (i > 0 && i < all.length - 1));

// ---------- Ảnh ----------
type Img = { data: string; w: number; h: number };

// Chỉ đọc file trong thư mục upload của server; chặn "../" thoát ra ngoài.
function localUploadPath(src: string): string | null {
  if (!src.startsWith('/uploads/')) return null;
  const file = path.resolve(config.uploadDir, decodeURIComponent(src.slice('/uploads/'.length)));
  return file.startsWith(path.resolve(config.uploadDir) + path.sep) && fs.existsSync(file) ? file : null;
}

// WebP / SVG... -> PNG (ảnh có nền trong suốt) hoặc JPEG, tối đa 1600px.
async function loadImage(src: string, density?: number): Promise<Img | null> {
  const file = localUploadPath(src);
  if (!file) return null;
  try {
    const img = sharp(file, density ? { density } : {}).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
    const meta = await img.metadata();
    const png = meta.hasAlpha || !!density;
    const { data, info } = await (png ? img.png() : img.jpeg({ quality: 85 })).toBuffer({ resolveWithObject: true });
    return { data: `image/${png ? 'png' : 'jpeg'};base64,${data.toString('base64')}`, w: info.width, h: info.height };
  } catch {
    return null; // file hỏng -> bỏ qua ảnh, không làm hỏng cả file PPT
  }
}

// Đặt ảnh vừa khung, giữ tỉ lệ, căn giữa.
function fit(img: Img, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.w, h / img.h);
  const iw = img.w * scale;
  const ih = img.h * scale;
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

// ---------- Dựng file ----------
export async function buildDeck(input: DeckInput): Promise<{ data: Buffer; slides: number }> {
  const L = LABELS[input.lang];
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = input.title;
  pptx.author = input.author;
  pptx.company = 'KVH IT Docs';
  pptx.theme = { headFontFace: BRAND.font, bodyFontFace: BRAND.font };

  const logo = `image/png;base64,${LOGO.toString('base64')}`;
  // Slide nội dung: vạch xanh trên cùng, gạch vàng dưới tiêu đề, logo + số trang + tên bài ở chân.
  pptx.defineSlideMaster({
    title: 'CONTENT',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: BRAND.blue } } },
      { rect: { x: BX, y: 1.17, w: 1.1, h: 0.06, fill: { color: BRAND.yellow } } },
      { image: { data: logo, x: W - 0.6 - 1.25, y: 6.98, w: 1.25, h: 1.25 / LOGO_RATIO } },
      { text: { text: input.title, options: { x: BX, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: BRAND.muted, fontFace: BRAND.font } } },
    ],
    slideNumber: { x: W - 2.45, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: BRAND.muted, fontFace: BRAND.font },
  });
  // Slide mở chương: nền xanh, chữ trắng.
  pptx.defineSlideMaster({
    title: 'SECTION',
    background: { color: BRAND.blue },
    objects: [{ rect: { x: BX, y: 4.25, w: 1.6, h: 0.08, fill: { color: BRAND.yellow } } }],
    slideNumber: { x: W - 1.1, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: 'FFFFFF', fontFace: BRAND.font },
  });

  const addTitle = (slide: Slide, text: string) =>
    slide.addText(text, { x: BX, y: 0.32, w: BW, h: 0.8, fontSize: 26, bold: true, color: BRAND.text, fontFace: BRAND.font, valign: 'bottom', fit: 'shrink', margin: 0 });

  // ----- Bìa -----
  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addImage({ data: logo, x: 0.7, y: 0.6, w: 3.0, h: 3.0 / LOGO_RATIO });
  cover.addText(input.title, { x: 0.7, y: 1.9, w: W - 1.4, h: 2.2, fontSize: 40, bold: true, color: BRAND.text, fontFace: BRAND.font, valign: 'bottom', fit: 'shrink', margin: 0 });
  cover.addShape('rect', { x: 0.7, y: 4.3, w: 2.0, h: 0.08, fill: { color: BRAND.blue } });
  cover.addShape('rect', { x: 2.7, y: 4.3, w: 0.8, h: 0.08, fill: { color: BRAND.yellow } });
  const dateLocale = { vi: 'vi-VN', en: 'en-GB', ja: 'ja-JP' }[input.lang];
  const meta = [
    `${L.author}: ${input.author}`,
    `${L.updated}: ${input.updatedAt.toLocaleDateString(dateLocale)}`,
    input.category ? `${L.category}: ${input.category}` : '',
    `${L.language}: ${L.langName} · ${L.version} ${input.version}`,
  ].filter(Boolean);
  cover.addText(meta.join('\n'), { x: 0.7, y: 4.6, w: W - 1.4, h: 1.7, fontSize: 16, color: '374151', fontFace: BRAND.font, valign: 'top', margin: 0, paraSpaceAfter: 4 });
  cover.addShape('rect', { x: 0, y: 6.95, w: W, h: 0.55, fill: { color: BRAND.blue } });
  const docLink = absUrl(input.docUrl, input.baseUrl);
  cover.addText(docLink ? [{ text: `${L.original}: ${docLink}`, options: { hyperlink: { url: docLink }, color: 'FFFFFF' } }] : 'KVH IT Docs', {
    x: 0.7, y: 6.95, w: W - 1.4, h: 0.55, fontSize: 11, color: 'FFFFFF', fontFace: BRAND.font, valign: 'middle', margin: 0,
  });

  // ----- Slide nội dung -----
  // Gom theo NHÓM: tiêu đề hiện tại + các khối chữ + tối đa 2 ảnh. Có ảnh thì chữ
  // cột trái, ảnh cột phải — giống bố cục slide gốc (bài nhập từ PPT: mỗi slide =
  // tiêu đề + chữ + ảnh). Chữ tràn thì sang slide "(tiếp)".
  type Raw =
    | { kind: 'text'; lines: string[] }
    | { kind: 'callout'; variant: keyof typeof CALLOUT_COLORS; lines: string[] }
    | { kind: 'code'; lines: string[] }
    | { kind: 'table'; rows: TableRow[]; cells: string[][]; cols: number; fontSize: number };
  type Pic = { img: Img | null; caption: string; src: string };
  type BodyItem = { h: number; render: (slide: Slide, x: number, y: number) => void };
  let title = input.title;
  let continued = false;
  let raws: Raw[] = [];
  let pics: Pic[] = [];

  const contentSlide = () => {
    const slide = pptx.addSlide({ masterName: 'CONTENT' });
    addTitle(slide, continued ? `${title} ${L.cont}` : title);
    continued = true;
    return slide;
  };

  // Các khối chữ của nhóm -> từng mẩu vừa khung rộng `w` (mẩu nào cũng thấp hơn một slide).
  const toItems = (w: number): BodyItem[] =>
    raws.flatMap((r): BodyItem[] => {
      if (r.kind === 'text') {
        return chunkLines(r.lines, 18, w, BH).map((chunk) => {
          const h = lineCount(chunk, 18, w) * lineHeight(18) + 0.1;
          return {
            h,
            render: (s, x, y) =>
              s.addText(markdownRuns(chunk, { fontSize: 18, color: BRAND.text, fontFace: BRAND.font }, input.baseUrl), {
                x, y, w, h, valign: 'top', margin: 0, paraSpaceAfter: 4,
              }),
          };
        });
      }
      if (r.kind === 'callout') {
        const colors = CALLOUT_COLORS[r.variant];
        return chunkLines(r.lines, 16, w - 0.5, BH - 0.3).map((chunk) => {
          const h = lineCount(chunk, 16, w - 0.5) * lineHeight(16) + 0.3;
          return {
            h,
            render: (s, x, y) => {
              s.addShape('rect', { x, y, w, h, fill: { color: colors.fill }, line: { color: colors.fill } });
              s.addShape('rect', { x, y, w: 0.08, h, fill: { color: colors.bar }, line: { color: colors.bar } });
              s.addText(markdownRuns(chunk, { fontSize: 16, color: BRAND.text, fontFace: BRAND.font }, input.baseUrl), {
                x: x + 0.3, y: y + 0.12, w: w - 0.5, h: h - 0.24, valign: 'top', margin: 0, paraSpaceAfter: 2,
              });
            },
          };
        });
      }
      if (r.kind === 'table') {
        // Bảng nhỏ nằm chung slide với chữ (bảng lớn đã được tách riêng từ trước).
        const h = tableHeight(r.cells, r.cols, w, r.fontSize);
        return [
          {
            h,
            render: (s, x, y) =>
              s.addTable(r.rows, {
                x, y, w, colW: Array(r.cols).fill(w / r.cols), fontSize: r.fontSize, fontFace: BRAND.font, color: BRAND.text,
                border: { type: 'solid', pt: 0.5, color: 'CBD5E1' }, valign: 'middle', autoPage: false,
              }),
          },
        ];
      }
      const out: BodyItem[] = []; // mã lệnh: 22 dòng một mẩu
      for (let i = 0; i < r.lines.length; i += 22) {
        const chunk = r.lines.slice(i, i + 22).join('\n');
        const h = Math.min(22, r.lines.length - i) * 0.22 + 0.3;
        out.push({
          h,
          render: (s, x, y) =>
            s.addText(chunk, { x, y, w, h, fontSize: 12, fontFace: BRAND.mono, color: '111827', valign: 'top', fill: { color: 'F3F4F6' }, margin: 8 }),
        });
      }
      return out;
    });

  // Xếp các mẩu từ trên xuống; trả về phần không còn chỗ trên slide này.
  const stack = (slide: Slide, items: BodyItem[], x: number): BodyItem[] => {
    let y = BY;
    let i = 0;
    for (; i < items.length; i++) {
      if (i > 0 && y + items[i].h > BY + BH) break;
      items[i].render(slide, x, y);
      y += items[i].h + GAP;
    }
    return items.slice(i);
  };

  // Ảnh xếp lưới trong khung (x, y, w, h): số cột chọn theo số ảnh + hình dạng khung.
  const placePics = (slide: Slide, list: Pic[], x: number, y: number, w: number, h: number) => {
    const n = list.length;
    const cols = n === 1 ? 1 : n === 2 ? (w > h * 1.2 ? 2 : 1) : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const cw = (w - GAP * (cols - 1)) / cols;
    const ch = (h - GAP * (rows - 1)) / rows;
    list.forEach((pic, i) => {
      const cx = x + (i % cols) * (cw + GAP);
      const cy = y + Math.floor(i / cols) * (ch + GAP);
      const capH = pic.caption ? 0.35 : 0;
      if (pic.img) slide.addImage({ data: pic.img.data, ...fit(pic.img, cx, cy, cw, ch - capH) });
      else slide.addText(`${L.noImage}: ${pic.src}`, { x: cx, y: cy, w: cw, h: 0.5, fontSize: 12, color: BRAND.muted, fontFace: BRAND.font });
      if (pic.caption) {
        slide.addText(pic.caption, { x: cx, y: cy + ch - capH, w: cw, h: capH, fontSize: 12, italic: true, color: BRAND.muted, align: 'center', fontFace: BRAND.font, fit: 'shrink' });
      }
    });
  };

  const MAX_PICS_WITH_TEXT = 4;
  const MAX_PICS = 6;
  const picSlides = (list: Pic[]) => {
    for (let i = 0; i < list.length; i += MAX_PICS) placePics(contentSlide(), list.slice(i, i + MAX_PICS), BX, BY, BW, BH);
  };
  const flush = () => {
    if (!raws.length && !pics.length) return;
    // Có bảng thì cần cả bề ngang: chữ + bảng trước, ảnh sang slide riêng.
    const sideBySide = pics.length > 0 && raws.length > 0 && !raws.some((r) => r.kind === 'table');
    if (!sideBySide) {
      let rest = toItems(BW);
      while (rest.length) rest = stack(contentSlide(), rest, BX);
      picSlides(pics);
    } else {
      // Chữ cột trái (55%), tối đa 4 ảnh cột phải; chữ / ảnh còn thừa sang slide "(tiếp)".
      const textW = BW * 0.55;
      const slide = contentSlide();
      placePics(slide, pics.slice(0, MAX_PICS_WITH_TEXT), BX + textW + 0.3, BY, BW - textW - 0.3, BH);
      let rest = stack(slide, toItems(textW), BX);
      while (rest.length) rest = stack(contentSlide(), rest, BX);
      picSlides(pics.slice(MAX_PICS_WITH_TEXT));
    }
    raws = [];
    pics = [];
  };
  const setTitle = (text: string) => {
    flush();
    title = text || input.title;
    continued = false;
  };
  // Slide riêng cho một khối (bước, bảng, biểu đồ, video).
  const ownSlide = (heading = title) => {
    flush();
    const slide = pptx.addSlide({ masterName: 'CONTENT' });
    addTitle(slide, heading);
    return slide;
  };
  const addPic = (pic: Pic) => {
    if (pics.length === MAX_PICS) flush();
    pics.push(pic);
  };

  // Ảnh trang trí lặp lại (vd logo trên mọi slide của file PPT gốc): cùng nội dung
  // xuất hiện từ 4 lần trở lên -> bỏ qua, slide bìa / chân trang đã có logo.
  const imageCount = new Map<string, number>();
  const imageHash = new Map<string, string>();
  for (const b of input.blocks) {
    const file = b.type === 'image' ? localUploadPath(String(b.props.src ?? '')) : null;
    if (!file) continue;
    const hash = createHash('sha1').update(fs.readFileSync(file)).digest('hex');
    imageHash.set(String(b.props.src), hash);
    imageCount.set(hash, (imageCount.get(hash) ?? 0) + 1);
  }
  const decorative = (src: string) => (imageCount.get(imageHash.get(src) ?? '') ?? 0) >= 4;

  let stepNo = 0;
  const files: { name: string; url: string | null }[] = [];

  for (const block of input.blocks) {
    const p = block.props as Record<string, never>;
    switch (block.type) {
      case 'heading': {
        const text = String(p.text ?? '').trim();
        if (p.level === 3) {
          setTitle(text);
        } else {
          // Chương mới: slide nền xanh rồi các slide sau mang tiêu đề chương.
          flush();
          const slide = pptx.addSlide({ masterName: 'SECTION' });
          slide.addText(text, { x: BX, y: 2.2, w: BW, h: 1.9, fontSize: 36, bold: true, color: 'FFFFFF', fontFace: BRAND.font, valign: 'bottom', fit: 'shrink', margin: 0 });
          title = text;
          continued = false;
        }
        break;
      }

      case 'paragraph':
        if (String(p.text ?? '').trim()) raws.push({ kind: 'text', lines: splitLines(String(p.text)) });
        break;

      case 'checklist': {
        const items = (p.items ?? []) as { text: string }[];
        if (items.length) raws.push({ kind: 'text', lines: items.map((i) => `☐ ${i.text}`) });
        break;
      }

      case 'callout': {
        const variant = (String(p.variant) in CALLOUT_COLORS ? String(p.variant) : 'info') as keyof typeof CALLOUT_COLORS;
        raws.push({ kind: 'callout', variant, lines: [`**${L[variant]}**`, ...splitLines(String(p.text ?? ''))] });
        break;
      }

      case 'code': {
        const code = String(p.code ?? '').replace(/\r/g, '');
        if (code.trim()) raws.push({ kind: 'code', lines: code.split('\n') });
        break;
      }

      case 'step': {
        stepNo++;
        const heading = `${L.step} ${stepNo}: ${String(p.title ?? '').trim()}`.replace(/:\s*$/, '');
        const img = p.image ? await loadImage(String(p.image)) : null;
        const textW = img ? 5.9 : BW;
        const lines = splitLines(String(p.text ?? ''));
        // Chữ dài thì thu nhỏ cỡ chữ trước, vẫn tràn thì phần còn lại sang slide "(tiếp)".
        const fontSize = lineCount(lines, 18, textW) * lineHeight(18) <= BH ? 18 : 15;
        const chunks = lines.length ? chunkLines(lines, fontSize, textW, BH) : [[]];
        chunks.forEach((chunk, i) => {
          const slide = ownSlide(i === 0 ? heading : `${heading} ${L.cont}`);
          if (chunk.length) {
            slide.addText(markdownRuns(chunk, { fontSize, color: BRAND.text, fontFace: BRAND.font }, input.baseUrl), {
              x: BX, y: BY, w: textW, h: BH, valign: 'top', margin: 0, paraSpaceAfter: 4,
            });
          }
          if (img && i === 0) slide.addImage({ data: img.data, ...fit(img, BX + 6.3, BY, BW - 6.3, BH) });
        });
        continued = true;
        break;
      }

      case 'image':
        if (p.src && !decorative(String(p.src))) addPic({ img: await loadImage(String(p.src)), caption: String(p.caption ?? '').trim(), src: String(p.src) });
        break;

      case 'diagram': {
        // Sơ đồ draw.io được lưu dạng SVG -> vẽ ra PNG độ phân giải cao.
        const img = p.src ? await loadImage(String(p.src), 200) : null;
        if (img) addPic({ img, caption: String(p.caption ?? '').trim(), src: String(p.src) });
        break;
      }

      case 'table': {
        const raw = (p.rows ?? []) as string[][];
        const cols = Math.max(0, ...raw.map((r) => r.length));
        if (!raw.length || !cols) break;
        const header = p.header !== false;
        const fontSize = cols > 6 ? 10 : 12;
        const cells = raw.map((r) => Array.from({ length: cols }, (_, ci) => String(r[ci] ?? '').replace(/\*\*/g, '')));
        const rows: TableRow[] = cells.map((r, ri) =>
          r.map((text) => ({ text, options: ri === 0 && header ? { bold: true, color: 'FFFFFF', fill: { color: BRAND.blue } } : {} })),
        );
        // Bảng nhỏ (vừa ~85% một slide) -> nằm chung slide với chữ của nhóm.
        if (tableHeight(cells, cols, BW, fontSize) <= BH * 0.85) {
          raws.push({ kind: 'table', rows, cells, cols, fontSize });
          break;
        }
        const slide = ownSlide();
        // autoPage: bảng dài tự tràn sang slide mới (lặp lại dòng tiêu đề bảng).
        slide.addTable(rows, {
          x: BX, y: BY, w: BW, colW: Array(cols).fill(BW / cols), fontSize, fontFace: BRAND.font, color: BRAND.text,
          border: { type: 'solid', pt: 0.5, color: 'CBD5E1' }, valign: 'middle',
          autoPage: true, autoPageRepeatHeader: header, autoPageSlideStartY: BY,
        });
        continued = true;
        break;
      }

      case 'chart': {
        // rows[0] = [nhãn cột đầu, tên chuỗi 1, tên chuỗi 2...], rows[1..] = [nhãn, số, số...]
        const rows = (p.rows ?? []) as string[][];
        if (rows.length < 2 || (rows[0]?.length ?? 0) < 2) break;
        const labels = rows.slice(1).map((r) => String(r[0] ?? ''));
        const num = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0;
        let data = rows[0].slice(1).map((name, i) => ({ name: String(name), labels, values: rows.slice(1).map((r) => num(r[i + 1])) }));
        const kind = String(p.kind ?? 'bar');
        // barH = cột ngang (barDir 'bar'); combo chưa hỗ trợ -> vẽ dạng cột.
        const type: ChartName = ({ line: 'line', area: 'area', pie: 'pie', donut: 'doughnut' } as const)[kind as 'line'] ?? 'bar';
        if (kind === 'pie' || kind === 'donut') data = data.slice(0, 1); // tròn: chỉ một chuỗi
        const colors = ((p.colors ?? []) as string[]).filter(Boolean).map((c) => c.replace('#', ''));
        const chartTitle = String(p.title ?? '').trim();
        const unit = String(p.unit ?? '').trim();
        const slide = ownSlide(chartTitle || title);
        slide.addChart(type, data, {
          x: BX, y: BY, w: BW, h: BH,
          barDir: kind === 'barH' ? 'bar' : 'col',
          barGrouping: p.stacked ? 'stacked' : 'clustered',
          showLegend: p.legend !== false, legendPos: 'b',
          chartColors: colors.length ? colors : [BRAND.blue, BRAND.yellow, '4F81BD', 'C0504D', '9BBB59', '8064A2'],
          showValAxisTitle: !!unit && kind !== 'pie' && kind !== 'donut', valAxisTitle: unit,
          showPercent: kind === 'pie' || kind === 'donut',
          fontFace: BRAND.font,
        });
        continued = true;
        break;
      }

      case 'video': {
        const url = absUrl(String(p.src ?? ''), input.baseUrl);
        const caption = String(p.caption ?? '').trim();
        const slide = ownSlide(caption || `${L.video} — ${title}`);
        if (url) {
          const qr = await QRCode.toBuffer(url, { margin: 1, width: 600 });
          slide.addImage({ data: `image/png;base64,${qr.toString('base64')}`, x: BX + 0.2, y: BY + 0.2, w: 3.6, h: 3.6 });
          slide.addText(
            [
              { text: `▶ ${L.video}`, options: { bold: true, fontSize: 22, breakLine: true } },
              { text: L.scan, options: { fontSize: 16, color: BRAND.muted, breakLine: true } },
              { text: url, options: { fontSize: 14, hyperlink: { url }, color: BRAND.blue } },
            ],
            { x: BX + 4.4, y: BY + 0.6, w: BW - 4.6, h: 2.8, fontFace: BRAND.font, color: BRAND.text, valign: 'top', margin: 0, paraSpaceAfter: 10 },
          );
        } else {
          slide.addText(`▶ ${L.video}: ${p.src ?? ''}`, { x: BX, y: BY, w: BW, h: 0.6, fontSize: 18, color: BRAND.text, fontFace: BRAND.font });
        }
        continued = true;
        break;
      }

      case 'file':
        if (p.src) files.push({ name: String(p.name || p.src), url: absUrl(String(p.src), input.baseUrl) });
        break;

      case 'divider':
        flush();
        break;
    }
  }
  flush();

  // ----- Slide cuối: tệp đính kèm (vd file .pptx gốc của bài nhập từ PowerPoint) -----
  if (files.length) {
    const slide = ownSlide(L.files);
    slide.addText(
      files.map((f, i) => ({
        text: f.name,
        options: { bullet: true, breakLine: i < files.length - 1, ...(f.url ? { hyperlink: { url: f.url }, color: BRAND.blue } : {}) },
      })),
      { x: BX, y: BY, w: BW, h: BH, fontSize: 18, fontFace: BRAND.font, color: BRAND.text, valign: 'top', margin: 0, paraSpaceAfter: 6 },
    );
  }

  const data = Buffer.from((await pptx.write({ outputType: 'nodebuffer', compression: true })) as Uint8Array);
  // Đếm slide thật trong file (bảng dài tự tràn nên không đếm tay được).
  const slides = Object.keys(unzipSync(new Uint8Array(data), { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) })).length;
  return { data, slides };
}
