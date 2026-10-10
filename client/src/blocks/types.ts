// ============================================================
// blocks/types.ts — "Hợp đồng" chung của mọi loại khối
// ============================================================
// Mỗi loại khối = MỘT thư mục trong src/blocks/, gồm:
//   Edit.tsx  — giao diện khi soạn
//   View.tsx  — giao diện khi đọc (và khi in)
//   index.ts  — gom lại thành một BlockDefinition
// rồi đăng ký trong registry.ts. Trình soạn, trang đọc, menu "Thêm khối",
// mục lục... đều đọc từ registry, KHÔNG có chỗ nào switch theo type.
//
// Thêm loại khối mới:
//   1. thêm kiểu props vào BlockPropsMap bên dưới
//   2. tạo thư mục blocks/<tên>/ (copy từ khối giống nhất rồi sửa)
//   3. thêm một dòng vào registry.ts   (TS báo lỗi nếu quên)
//   4. thêm schema zod ở server/src/blocks/schemas.ts
//   5. thêm chữ ở i18n/vi.ts (blocks.<tên>.label/desc) + en.ts, ja.ts
// 🔸 Flutter: giống Map<String, WidgetBuilder> — chọn widget theo field `type` trong JSON.

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export type CalloutVariant = 'info' | 'success' | 'warning' | 'danger';

// Dữ liệu riêng của từng loại khối. PHẢI khớp với zod ở server.
export type BlockPropsMap = {
  heading: { text: string; level: 2 | 3 };
  paragraph: { text: string };
  image: { src: string; alt: string; caption: string };
  video: { src: string; caption: string };
  file: { src: string; name: string; size: number };
  table: { header: boolean; rows: string[][] };
  callout: { variant: CalloutVariant; text: string };
  code: { language: string; code: string };
  checklist: { items: { id: string; text: string }[] };
  divider: Record<string, never>;
  step: { title: string; text: string; image: string };
};

export type BlockType = keyof BlockPropsMap;

// Một khối cụ thể. Viết kiểu "mapped type" để TS hiểu: type là 'image'
// thì props CHẮC CHẮN là props của ảnh (không lẫn sang props của bảng).
export type Block = { [K in BlockType]: { id: string; type: K; props: BlockPropsMap[K] } }[BlockType];

// Thông tin phụ mà khối không tự biết được, phải tính từ CẢ tài liệu:
// số thứ tự bước, id để nhảy tới từ mục lục...
export type BlockMeta = {
  anchor?: string;
  stepNumber?: number;
  docId?: string;
};

export type BlockViewProps<K extends BlockType> = {
  blockId: string;
  props: BlockPropsMap[K];
  meta: BlockMeta;
};

export type BlockEditProps<K extends BlockType> = BlockViewProps<K> & {
  // Trả về props MỚI (không sửa object cũ) — React so sánh bằng tham chiếu.
  onChange: (props: BlockPropsMap[K]) => void;
};

export type BlockDefinition<K extends BlockType> = {
  type: K;
  icon: LucideIcon;
  // Props mặc định khi thêm khối mới. Cũng dùng để "vá" khối cũ thiếu
  // field (vd dữ liệu lưu từ phiên bản app trước).
  create: () => BlockPropsMap[K];
  Edit: ComponentType<BlockEditProps<K>>;
  View: ComponentType<BlockViewProps<K>>;
};

// Registry phải có ĐỦ mọi loại khối — thiếu một cái là TS báo lỗi.
export type BlockRegistry = { [K in BlockType]: BlockDefinition<K> };
