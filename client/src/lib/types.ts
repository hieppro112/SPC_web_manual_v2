// ============================================================
// lib/types.ts — Hình dạng dữ liệu API trả về
// ============================================================
// Phải khớp với model ở server/src/models/. Kiểu TS chỉ tồn tại lúc viết
// code: server trả sai thì TS không bắt được lúc chạy.

import type { Block } from '../blocks/types.ts';

// admin > editor (soạn tài liệu, tạo đề) > user (chỉ đọc + làm bài kiểm tra)
export type Role = 'admin' | 'editor' | 'user';
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
  employeeCode: string | null;
  // Bộ phận tra từ dữ liệu nhân viên (cập nhật mỗi lần đăng nhập) — quyết định xem được thể loại nào.
  department?: string | null;
};

// Được soạn tài liệu / tạo đề không (editor, admin). Khách và role "user" -> false.
// Chỉ để ẩn/hiện nút; server mới là nơi chặn thật.
export const isEditor = (user: User | null | undefined): boolean => user?.role === 'admin' || user?.role === 'editor';

export type Category = {
  id: string;
  name: string;
  iconName: string;
  // Thể loại cha; null = cấp cao nhất (thể loại dạng cây)
  parentId: string | null;
  // Dùng chung cho mọi bộ phận (+ khách). Thể loại tên "Community" cũng được coi là dùng chung.
  isShared?: boolean;
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
  // Chỉ có trong danh sách: tiêu đề + mô tả đã dịch sang ngôn ngữ người đọc (null = chưa có / là bài gốc)
  translated?: { title: string; desc: string } | null;
  // Lượt xem (mỗi người tối đa 1 lần / ngày) + số tim
  stats?: { views: number; likes: number };
  // Chỉ có trong danh sách: ảnh bìa (ảnh đầu tiên trong bài, null = bài không có ảnh)
  // + số phút đọc ước tính theo độ dài chữ.
  cover?: string | null;
  readMinutes?: number;
};

// readingSeconds: thời gian đọc tối thiểu (giây), null = không bắt buộc.
// stats.likedByMe: người đang xem đã thả tim bài này chưa.
export type Doc = Omit<DocSummary, 'stats'> & {
  blocks: Block[];
  readingSeconds?: number | null;
  stats?: { views: number; likes: number; likedByMe: boolean };
};

// Dữ liệu gửi lên khi tạo/sửa.
export type DocInput = {
  title: string;
  category: string;
  status: DocStatus;
  blocks: Block[];
  readingSeconds?: number | null;
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
