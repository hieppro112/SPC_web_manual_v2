// ============================================================
// features/documents/cover.ts — Hàm nhỏ cho thẻ tài liệu ở trang chủ
// ============================================================
import { useState } from 'react';
import type { DocSummary } from '../../lib/types.ts';

// Ảnh trong bài (tối đa 1920px) -> bản thu nhỏ 640px cho thẻ (server tự tạo lần đầu,
// xem server/src/routes/thumbs.ts). Ảnh ngoài (link http...) / sơ đồ SVG giữ nguyên.
export function thumbUrl(src: string): string {
  const m = /^\/uploads\/images\/([\w-]+\.(?:webp|gif|png|jpe?g))$/i.exec(src);
  return m ? `/uploads/thumbs/${m[1]}` : src;
}

// Bài không có ảnh: nền màu theo thể loại (cùng thể loại = cùng màu, class ở index.css).
const TONES = 6;
export function coverTone(doc: Pick<DocSummary, 'id' | 'category'>): string {
  const key = doc.category?.id ?? doc.id;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `cover-tone-${hash % TONES}`;
}

// Bài tạo trong 7 ngày gần đây -> nhãn "Mới".
const NEW_DAYS = 7;
export function isNewDoc(doc: Pick<DocSummary, 'createdAt'>, now: number): boolean {
  return now - new Date(doc.createdAt).getTime() < NEW_DAYS * 24 * 3600_000;
}

// "Bây giờ" chụp MỘT lần lúc component xuất hiện (lazy init của useState).
// Gọi Date.now() thẳng trong lúc render thì mỗi lần vẽ lại ra kết quả khác —
// React coi đó là render "không thuần" (linter cũng báo).
// 🔸 Flutter: giống lấy DateTime.now() trong initState() rồi giữ trong State.
export function useNow(): number {
  return useState(() => Date.now())[0];
}
