// ============================================================
// services/pptx/extract.ts — Đọc nội dung file PowerPoint (.pptx), KHÔNG dùng AI
// ============================================================
// File .pptx thực chất là file .zip chứa các file XML:
//   ppt/presentation.xml          thứ tự các slide
//   ppt/slides/slideN.xml          nội dung slide (ô chữ, bảng, ảnh)
//   ppt/slides/_rels/slideN.xml.rels   "rId5 -> ../media/image3.png", "-> notesSlide2.xml"
//   ppt/notesSlides/notesSlideN.xml    ghi chú của người thuyết trình
//   ppt/media/*                    ảnh
//
// Kết quả: mỗi slide một mục { chữ theo thứ tự đọc, bảng, ảnh, ghi chú }.
// Chữ / ảnh lặp lại ở nhiều slide (dòng "TRAINING KVH-PC" ở đầu trang, logo)
// được tự bỏ. Phần sắp xếp thành bài viết do AI làm sau (services/pptx/importPrompt.ts).

import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { HttpError } from '../../middleware/errorHandler.ts';

export type SlideImage = { id: string; media: string; width: number; height: number };
export type ExtractedSlide = {
  n: number; // số thứ tự slide (1, 2, 3... theo thứ tự trình chiếu)
  texts: string[]; // các dòng chữ theo thứ tự đọc (trên xuống, trái sang phải)
  tables: string[][][];
  images: SlideImage[];
  notes: string;
};
export type ExtractedDeck = {
  slides: ExtractedSlide[];
  media: Record<string, Uint8Array>; // đường dẫn trong zip -> nội dung ảnh
  removedLines: string[]; // chữ lặp ở nhiều slide đã bỏ (để báo cho editor)
};

const MAX_UNCOMPRESSED = 400 * 1024 * 1024; // chặn "zip bomb": file nhỏ nhưng giải nén ra cực lớn
const EMU_PER_PX = 9525; // đơn vị đo của PowerPoint: 914400 EMU = 1 inch = 96 px
const TINY_EMU = 360_000; // ảnh nhỏ hơn ~1 cm cả 2 chiều = icon trang trí, bỏ

// ---------- Tiện ích XML (đọc bằng regex: file PowerPoint có cấu trúc cố định) ----------

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Một đoạn <a:p>: nối các mảnh chữ <a:t> liền nhau (PowerPoint hay cắt một từ
// thành nhiều mảnh định dạng khác nhau), <a:br/> = xuống dòng.
function paragraphText(pXml: string): string {
  const cleaned = pXml.replace(/<a:fld\b[^>]*type="slidenum"[\s\S]*?<\/a:fld>/g, ''); // bỏ số trang
  let out = '';
  for (const m of cleaned.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:t\/>|<a:br\b[^>]*\/>/g)) {
    out += m[0].startsWith('<a:br') ? '\n' : decode(m[1] ?? '');
  }
  return out
    .replace(/_{6,}/g, '_____') // dòng kẻ chỗ điền rất dài -> ngắn lại (đỡ tốn chữ gửi AI)
    .replace(/[.…]{4,}/g, ' … ') // dấu chấm dẫn ở mục lục "Thuật ngữ………………3"
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Các dòng chữ trong một ô (shape). Gạch đầu dòng cấp 2, 3... thụt vào cho AI biết.
function shapeLines(xml: string): string[] {
  const lines: string[] = [];
  for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const body = m[1] ?? m[2] ?? '';
    const text = paragraphText(body);
    if (!text) continue;
    const lvl = Number(body.match(/<a:pPr\b[^>]*\blvl="(\d)"/)?.[1] ?? 0);
    for (const line of text.split('\n')) if (line.trim()) lines.push(`${'  '.repeat(lvl)}${line.trim()}`);
  }
  return lines;
}

function tableRows(xml: string): string[][] {
  const rows: string[][] = [];
  for (const tr of xml.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)) {
    const cells: string[] = [];
    for (const tc of tr[1].matchAll(/<a:tc\b([^>]*)>([\s\S]*?)<\/a:tc>/g)) {
      // Ô bị gộp (merge) lặp lại nội dung ô chính -> để trống.
      cells.push(/\b[hv]Merge="(1|true)"/.test(tc[1]) ? '' : shapeLines(tc[2]).map((l) => l.trim()).join(' '));
    }
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}

// Bảng quan hệ "rId -> file" của một file XML.
function readRels(files: Record<string, Uint8Array>, relsPath: string, baseDir: string): Map<string, { type: string; target: string }> {
  const map = new Map<string, { type: string; target: string }>();
  const data = files[relsPath];
  if (!data) return map;
  for (const m of strFromU8(data).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/)?.[1] ?? '';
    if (id && target && !/TargetMode="External"/.test(attrs)) map.set(id, { type, target: resolvePath(baseDir, target) });
  }
  return map;
}

// "ppt/slides" + "../media/image2.png" -> "ppt/media/image2.png"
function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir.split('/');
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

// ---------- Đọc file ----------

export function extractPptx(buf: Uint8Array, maxSlides: number): ExtractedDeck {
  let files: Record<string, Uint8Array>;
  try {
    let total = 0;
    files = unzipSync(buf, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNCOMPRESSED) throw new Error('too-large');
        // Chỉ giải nén phần cần dùng.
        return /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/|notesSlides\/|media\/)/.test(f.name);
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'too-large') throw new HttpError(400, 'File giải nén ra quá lớn, không xử lý được');
    throw new HttpError(400, 'Không đọc được file. Hãy chắc chắn đây là file PowerPoint .pptx');
  }
  if (!files['ppt/presentation.xml']) throw new HttpError(400, 'Không phải file PowerPoint .pptx hợp lệ');

  // Thứ tự slide theo presentation.xml (không theo tên file — slide có thể đã bị kéo đổi chỗ).
  const presRels = readRels(files, 'ppt/_rels/presentation.xml.rels', 'ppt');
  const slidePaths = [...strFromU8(files['ppt/presentation.xml']).matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map((m) => presRels.get(m[1])?.target)
    .filter((p): p is string => !!p && !!files[p]);
  if (!slidePaths.length) throw new HttpError(400, 'File không có slide nào');

  const slides: ExtractedSlide[] = [];
  const imageHashes = new Map<string, string>(); // nội dung ảnh trùng nhau (tên khác) -> dùng chung 1 file
  for (const path of slidePaths) {
    const xml = strFromU8(files[path]);
    if (/<p:sld\b[^>]*\bshow="(0|false)"/.test(xml)) continue; // slide bị ẩn khi trình chiếu
    if (slides.length >= maxSlides) throw new HttpError(400, `File có nhiều hơn ${maxSlides} slide, hãy chia nhỏ file`);

    const n = slides.length + 1;
    const dir = path.slice(0, path.lastIndexOf('/'));
    const rels = readRels(files, `${dir}/_rels/${path.slice(dir.length + 1)}.rels`, dir);

    // Các ô trên slide, kèm vị trí để sắp theo thứ tự đọc.
    type Item = { y: number; x: number; order: number; lines?: string[]; table?: string[][]; image?: SlideImage };
    const items: Item[] = [];
    let order = 0;
    for (const m of xml.matchAll(/<p:(sp|pic|graphicFrame)\b[^>]*>([\s\S]*?)<\/p:\1>/g)) {
      const [, kind, body] = m;
      const off = body.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
      const isTitle = /<p:ph\b[^>]*\btype="(title|ctrTitle)"/.test(body);
      const pos = { y: isTitle ? -1 : off ? Number(off[2]) : 0, x: off ? Number(off[1]) : 0, order: order++ };

      if (kind === 'graphicFrame') {
        if (body.includes('<a:tbl')) {
          const table = tableRows(body);
          if (table.length) items.push({ ...pos, table });
        }
        continue;
      }
      // Ảnh: <p:pic> hoặc ô chữ tô nền bằng ảnh. r:embed của <a:blip> là bản PNG/JPG
      // (bản SVG / hiệu ứng nghệ thuật nằm ở phần mở rộng, bỏ qua).
      const embed = body.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1];
      const target = embed ? rels.get(embed)?.target : undefined;
      if (target && files[target] && /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(target)) {
        const ext = body.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
        const cx = ext ? Number(ext[1]) : 0;
        const cy = ext ? Number(ext[2]) : 0;
        if (!(cx && cy && cx < TINY_EMU && cy < TINY_EMU)) {
          const hash = createHash('sha1').update(files[target]).digest('hex');
          const media = imageHashes.get(hash) ?? target;
          imageHashes.set(hash, media);
          items.push({ ...pos, image: { id: '', media, width: Math.round(cx / EMU_PER_PX), height: Math.round(cy / EMU_PER_PX) } });
        }
      }
      if (kind === 'sp') {
        const lines = shapeLines(body);
        if (lines.length) items.push({ ...pos, lines });
      }
    }
    // Thứ tự đọc: tiêu đề trước, rồi trên xuống (gom các ô cùng hàng ~0.5 cm), trái sang phải.
    items.sort((a, b) => (Math.abs(a.y - b.y) > 180_000 ? a.y - b.y : a.x - b.x || a.order - b.order));

    // Ghi chú: các ô trong notesSlide, trừ ô ảnh thu nhỏ của slide / số trang / đầu-cuối trang.
    let notes = '';
    const notesPath = [...rels.values()].find((r) => r.type.endsWith('/notesSlide'))?.target;
    if (notesPath && files[notesPath]) {
      const nx = strFromU8(files[notesPath]);
      notes = [...nx.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g)]
        .filter((m) => !/<p:ph\b[^>]*\btype="(sldImg|sldNum|hdr|ftr|dt)"/.test(m[1]))
        .flatMap((m) => shapeLines(m[1]))
        .join('\n')
        .trim();
    }

    slides.push({
      n,
      texts: items.flatMap((i) => i.lines ?? []),
      tables: items.flatMap((i) => (i.table ? [i.table] : [])),
      images: items.flatMap((i) => (i.image ? [i.image] : [])),
      notes,
    });
  }

  // ---------- Bỏ chữ / ảnh lặp ở nhiều slide (đầu trang, chân trang, logo) ----------
  const removedLines: string[] = [];
  if (slides.length >= 5) {
    const limit = Math.max(3, Math.ceil(slides.length * 0.4));
    const lineCount = new Map<string, number>();
    const mediaCount = new Map<string, number>();
    for (const s of slides) {
      for (const l of new Set(s.texts.map((t) => t.trim().toLowerCase()))) lineCount.set(l, (lineCount.get(l) ?? 0) + 1);
      for (const m of new Set(s.images.map((i) => i.media))) mediaCount.set(m, (mediaCount.get(m) ?? 0) + 1);
    }
    const repeatedLines = new Set([...lineCount].filter(([, c]) => c >= limit).map(([l]) => l));
    const repeatedMedia = new Set([...mediaCount].filter(([, c]) => c >= Math.max(3, Math.ceil(slides.length * 0.3))).map(([m]) => m));
    for (const s of slides) {
      s.texts = s.texts.filter((t) => !repeatedLines.has(t.trim().toLowerCase()));
      s.images = s.images.filter((i) => !repeatedMedia.has(i.media));
    }
    removedLines.push(...repeatedLines);
  }

  // Đặt mã ảnh cho AI tham chiếu: s12-i1, s12-i2... (ảnh trùng trong cùng slide chỉ giữ 1)
  const media: Record<string, Uint8Array> = {};
  for (const s of slides) {
    const seen = new Set<string>();
    s.images = s.images.filter((i) => !seen.has(i.media) && seen.add(i.media));
    s.images.forEach((img, k) => {
      img.id = `s${s.n}-i${k + 1}`;
      media[img.media] = files[img.media];
    });
  }
  return { slides, media, removedLines };
}
