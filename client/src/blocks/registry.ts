// ============================================================
// blocks/registry.ts — SỔ ĐĂNG KÝ mọi loại khối
// ============================================================
// Thêm loại khối mới = thêm MỘT dòng ở đây (xem hướng dẫn ở types.ts).
// Kiểu BlockRegistry bắt buộc có đủ mọi loại trong BlockPropsMap, nên
// quên đăng ký là TypeScript báo lỗi ngay.

import { calloutBlock } from './callout/index.ts';
import { checklistBlock } from './checklist/index.ts';
import { codeBlock } from './code/index.ts';
import { diagramBlock } from './diagram/index.ts';
import { dividerBlock } from './divider/index.ts';
import { fileBlock } from './file/index.ts';
import { headingBlock } from './heading/index.ts';
import { imageBlock } from './image/index.ts';
import { paragraphBlock } from './paragraph/index.ts';
import { stepBlock } from './step/index.ts';
import { tableBlock } from './table/index.ts';
import { videoBlock } from './video/index.ts';
import type { Block, BlockDefinition, BlockRegistry, BlockType } from './types.ts';

export const registry: BlockRegistry = {
  heading: headingBlock,
  paragraph: paragraphBlock,
  step: stepBlock,
  image: imageBlock,
  video: videoBlock,
  diagram: diagramBlock,
  callout: calloutBlock,
  checklist: checklistBlock,
  table: tableBlock,
  code: codeBlock,
  file: fileBlock,
  divider: dividerBlock,
};

// Thứ tự hiện trong menu "Thêm khối" — loại hay dùng nhất cho tài liệu quy trình lên đầu.
export const BLOCK_ORDER = Object.keys(registry) as BlockType[];

// Lấy định nghĩa dưới dạng "loại bất kỳ" để code chung (BlockView,
// BlockEdit) dùng được mà không phải switch theo từng loại.
export function getDefinition(type: string): BlockDefinition<BlockType> | undefined {
  return (registry as Record<string, BlockDefinition<BlockType>>)[type];
}

// Tạo khối mới với props mặc định.
export function createBlock(type: BlockType, id: string): Block {
  return { id, type, props: registry[type].create() } as Block;
}

// "Vá" khối thiếu field bằng giá trị mặc định (dữ liệu cũ, hoặc server
// trả thiếu). Nhờ vậy View/Edit luôn nhận props đầy đủ, khỏi kiểm tra
// undefined ở khắp nơi.
export function withDefaults(block: Block): Block {
  const def = getDefinition(block.type);
  if (!def) return block;
  return { ...block, props: { ...def.create(), ...(block.props ?? {}) } } as Block;
}
