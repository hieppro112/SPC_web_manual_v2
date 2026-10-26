// ============================================================
// services/guide/content/history.ts — Dấu vân tay các bản mẫu CŨ của bài hướng dẫn
// ============================================================
// Nút "Nạp bài hướng dẫn mẫu" so bài trong DB với danh sách này:
//   trùng một bản mẫu cũ  -> chưa ai sửa tay -> cập nhật lên nội dung mới trong vi.ts
//   không trùng           -> đã có người sửa  -> GIỮ NGUYÊN, không ghi đè công sức người khác
//
// Sửa vi.ts lần sau: chạy `npm run guide-hashes` TRƯỚC khi sửa, chép các dòng in ra vào đây.

import { createHash } from 'node:crypto';

// Tiêu đề + mảng khối (đúng dạng đã lưu trong DB) -> chuỗi sha1.
export function guideHash(title: string, blocks: unknown): string {
  return createHash('sha1').update(JSON.stringify([title, blocks])).digest('hex');
}

export const PAST_TEMPLATE_HASHES = new Set<string>([
  // bản mẫu đầu tiên (commit dbfb86c)
  '020d460f6fe8a80338982da3934b79c6e0e91641', // guide-vi-01-bat-dau
  'c44a58389fd870fb9ec589ed25f657932240b83b', // guide-vi-02-doc-tai-lieu
  '84f7be6ec19bd8a1b9f38cdb5b815a4d0c876443', // guide-vi-03-bai-kiem-tra
  '63df60e49e95623e458e180c2a72e1e803758277', // guide-vi-04-soan-tai-lieu
  '30301813fec22eeceb5dcdfe866cd0cbd84f7efb', // guide-vi-05-cac-loai-khoi
  '2e4679fbf1b147c9c0e66d7a93bb091c0cd07900', // guide-vi-06-de-kiem-tra-va-powerpoint
  '639185be4a63d041dfbe0f845dface9dd4e7bdf6', // guide-vi-07-quan-tri
  // thêm mục "Bản dịch tự động" (commit 10352a8)
  'fcfab47122269e9983352b1b480b0f6fcdd25494', // guide-vi-02-doc-tai-lieu
  'c2467592c905c2a34c7017d8bff5396a6ef6d3cf', // guide-vi-04-soan-tai-lieu
]);
