// ============================================================
// blocks/schemas.ts — Luật dữ liệu của TỪNG loại khối
// ============================================================
// Mongoose chỉ biết `props` là "object bất kỳ" (Mixed). File này mới là
// nơi nói rõ: khối ảnh phải có src/alt/caption, khối bảng phải có rows...
//
// zod làm 3 việc một lúc:
//   1. Kiểm tra kiểu (text phải là chuỗi, level chỉ 2 hoặc 3...)
//   2. Điền giá trị mặc định cho field client không gửi
//   3. LỌC BỎ field lạ — client gửi { text, hack: 1 } thì chỉ lưu { text }
//
// Thêm loại khối mới: thêm tên vào BLOCK_TYPES + thêm schema vào
// blockPropsSchemas (TypeScript báo lỗi nếu quên một trong hai), rồi
// thêm thư mục tương ứng trong client/src/blocks/.

import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';

export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'image',
  'video',
  'file',
  'table',
  'callout',
  'code',
  'checklist',
  'divider',
  'step',
  'diagram',
  'chart',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

const text = (max = 20_000) => z.string().max(max).default('');

// Đường dẫn ảnh/video/file chấp nhận 3 dạng:
//   ''               — khối mới thêm, chưa chọn file (cho phép lưu nháp)
//   http(s)://...    — dán URL
//   /uploads/...     — file đã upload lên chính server này
// Chặn các dạng nguy hiểm như "javascript:..." ngay từ lúc lưu.
const mediaUrl = z
  .string()
  .max(2000)
  .refine((v) => v === '' || /^https?:\/\//i.test(v) || v.startsWith('/uploads/'), {
    message: 'Đường dẫn phải bắt đầu bằng http(s):// hoặc /uploads/',
  })
  .default('');

// Ảnh sơ đồ chỉ được là file SVG do chính server lưu (POST /api/media/diagram).
const diagramUrl = z
  .string()
  .max(200)
  .refine((v) => v === '' || /^\/uploads\/diagrams\/[a-f0-9]+\.svg$/.test(v), {
    message: 'Ảnh sơ đồ không hợp lệ',
  })
  .default('');

// `satisfies Record<BlockType, ...>`: bắt TS kiểm tra object này có ĐỦ
// mọi loại khối, nhưng vẫn giữ kiểu chi tiết của từng schema.
export const blockPropsSchemas = {
  heading: z.object({ text: text(300), level: z.union([z.literal(2), z.literal(3)]).default(2) }),
  paragraph: z.object({ text: text() }),
  image: z.object({ src: mediaUrl, alt: text(300), caption: text(500) }),
  video: z.object({ src: mediaUrl, caption: text(500) }),
  file: z.object({ src: mediaUrl, name: text(255), size: z.number().int().nonnegative().default(0) }),
  table: z.object({
    header: z.boolean().default(true),
    rows: z.array(z.array(z.string().max(2000)).max(20)).max(200).default([]),
  }),
  callout: z.object({ variant: z.enum(['info', 'success', 'warning', 'danger']).default('info'), text: text() }),
  code: z.object({ language: text(30), code: z.string().max(100_000).default('') }),
  checklist: z.object({
    items: z.array(z.object({ id: z.string().min(1).max(50), text: text(1000) })).max(300).default([]),
  }),
  divider: z.object({}),
  step: z.object({ title: text(300), text: text(), image: mediaUrl }),
  // xml: bản gốc để mở draw.io sửa tiếp; src: ảnh SVG xuất ra để hiển thị.
  diagram: z.object({ xml: z.string().max(2_000_000).default(''), src: diagramUrl, caption: text(500) }),
  // rows[0] = tên các chuỗi số liệu, rows[1..] = [nhãn, số, số...] (số lưu dạng chuỗi)
  chart: z.object({
    kind: z.enum(['bar', 'barH', 'line', 'area', 'pie', 'donut', 'combo']).default('bar'),
    title: text(300),
    unit: text(50),
    legend: z.boolean().default(true),
    stacked: z.boolean().default(false),
    rows: z.array(z.array(z.string().max(200)).max(21)).max(501).default([]),
    colors: z.array(z.union([z.literal(''), z.string().regex(/^#[0-9a-f]{6}$/i)])).max(20).default([]),
  }),
} satisfies Record<BlockType, z.ZodType>;

const blockShape = z.object({
  id: z.string().min(1).max(50),
  type: z.enum(BLOCK_TYPES),
  props: z.unknown(),
});

export type ParsedBlock = { id: string; type: BlockType; props: Record<string, unknown> };

// Kiểm tra + chuẩn hóa cả mảng khối. Lỗi thì báo rõ khối thứ mấy để
// người soạn biết sửa chỗ nào.
export function parseBlocks(input: unknown): ParsedBlock[] {
  const list = z.array(blockShape).max(2000).safeParse(input);
  if (!list.success) {
    const issue = list.error.issues[0];
    throw new HttpError(400, `Danh sách khối không hợp lệ (${issue?.path.join('.')}): ${issue?.message}`);
  }

  return list.data.map((block, index) => {
    const result = blockPropsSchemas[block.type].safeParse(block.props ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path.join('.') || 'props';
      throw new HttpError(400, `Khối #${index + 1} (${block.type}) — ${field}: ${issue?.message}`);
    }
    return { id: block.id, type: block.type, props: result.data };
  });
}
