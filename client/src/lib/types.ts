// ============================================================
// lib/types.ts — Hình dạng dữ liệu API trả về
// ============================================================
// Phải khớp với model ở server/src/models/. Kiểu TS chỉ tồn tại lúc viết
// code: server trả sai thì TS không bắt được lúc chạy.

import type { Block } from '../blocks/types.ts';

export type Role = 'admin' | 'editor';
export type DocStatus = 'draft' | 'published';
export type MediaKind = 'image' | 'video' | 'file';

export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  role: Role;
  // pending = tự đăng ký, chờ admin duyệt
  status: 'active' | 'pending';
  createdAt: string;
};

export type Category = {
  id: string;
  name: string;
  iconName: string;
  // Thể loại cha; null = cấp cao nhất (thể loại dạng cây)
  parentId: string | null;
  // Số tài liệu nằm TRỰC TIẾP trong thể loại này (chưa cộng thể loại con)
  docCount: number;
};

// Thông tin thu gọn trong danh sách (không có blocks).
export type DocSummary = {
  id: string;
  title: string;
  slug: string;
  desc: string;
  status: DocStatus;
  version: number;
  category: Pick<Category, 'id' | 'name' | 'iconName'> | null;
  updatedBy: Pick<User, 'id' | 'displayName'> | null;
  createdAt: string;
  updatedAt: string;
};

export type Doc = DocSummary & { blocks: Block[] };

// Dữ liệu gửi lên khi tạo/sửa.
export type DocInput = {
  title: string;
  category: string;
  status: DocStatus;
  blocks: Block[];
};

export type DocVersion = {
  id: string;
  version: number;
  title: string;
  status: DocStatus;
  savedBy: Pick<User, 'id' | 'displayName'> | null;
  restoredFrom: number | null;
  createdAt: string;
};

export type DocVersionFull = DocVersion & {
  blocks: Block[];
  category: Pick<Category, 'id' | 'name' | 'iconName'> | null;
};

export type Media = {
  id: string;
  kind: MediaKind;
  url: string;
  originalName: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: string;
};

export type UploadSession = {
  token: string;
  kind: 'image' | 'video';
  expiresAt: string;
};

export type UploadSessionStatus = {
  kind: 'image' | 'video';
  status: 'pending' | 'done';
  expiresAt: string;
  media: Media | null;
};

export type ServerMeta = {
  publicBaseUrl: string | null;
  lanAddresses: string[];
  drawio: boolean; // server đã cài draw.io chưa (khối Sơ đồ)
};
