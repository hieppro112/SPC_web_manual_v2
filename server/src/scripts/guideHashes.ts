// ============================================================
// scripts/guideHashes.ts — In "dấu vân tay" của bài hướng dẫn mẫu hiện tại
// ============================================================
//   npm run guide-hashes
//
// TRƯỚC KHI sửa services/guide/content/vi.ts: chạy lệnh này rồi chép các dòng in ra
// vào PAST_TEMPLATE_HASHES (services/guide/content/history.ts). Nhờ vậy nút
// "Nạp bài hướng dẫn mẫu" nhận ra bài nào vẫn là bản mẫu cũ (chưa ai sửa tay) để
// cập nhật lên bản mới; bài đã sửa tay thì giữ nguyên.

import { parseBlocks } from '../blocks/schemas.ts';
import { toBlocks } from '../services/guide/content/types.ts';
import { vi } from '../services/guide/content/vi.ts';
import { guideHash } from '../services/guide/content/history.ts';

for (const doc of vi.docs) {
  console.log(`  '${guideHash(doc.title, parseBlocks(toBlocks(doc.slug, doc.blocks)))}', // ${doc.slug}`);
}
