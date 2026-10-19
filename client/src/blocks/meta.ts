// ============================================================
// blocks/meta.ts — Tính thông tin phụ cho từng khối + mục lục
// ============================================================
// Số "Bước 3" hay anchor "#chuan-bi" phụ thuộc vào VỊ TRÍ của khối trong
// cả tài liệu, nên không khối nào tự tính được. Hàm này duyệt cả danh
// sách một lần, trả về meta cho từng khối và danh sách mục lục.
// Trang đọc, trang lịch sử và chế độ xem trước của trình soạn dùng chung.

import { slugify } from '../lib/utils.ts';
import type { Block, BlockMeta } from './types.ts';

export type TocEntry = { anchor: string; label: string; depth: 1 | 2; stepNumber?: number };

// anchorSource: đang hiện BẢN DỊCH -> lấy anchor của khối cùng id ở bài gốc,
// để link "#chuan-bi" chia sẻ từ bài gốc vẫn nhảy đúng mục ở bản dịch.
export function computeBlockMeta(blocks: Block[], docId?: string, anchorSource?: Block[]) {
  const meta = new Map<string, BlockMeta>();
  const toc: TocEntry[] = [];
  const usedAnchors = new Set<string>();
  let stepNumber = 0;
  const sourceMeta = anchorSource ? computeBlockMeta(anchorSource, docId).meta : null;

  // Anchor đọc được ("chuan-bi") thay vì id khối ("k3j9x2"): link chia sẻ
  // tới một mục nhìn là hiểu. Trùng tên thì thêm -2, -3...
  const uniqueAnchor = (base: string) => {
    let anchor = base || 'muc';
    for (let i = 2; usedAnchors.has(anchor); i++) anchor = `${base}-${i}`;
    usedAnchors.add(anchor);
    return anchor;
  };

  for (const block of blocks) {
    if (block.type === 'heading' && block.props.text?.trim()) {
      const anchor = sourceMeta?.get(block.id)?.anchor ?? uniqueAnchor(slugify(block.props.text));
      meta.set(block.id, { anchor, docId });
      toc.push({ anchor, label: block.props.text, depth: block.props.level === 3 ? 2 : 1 });
    } else if (block.type === 'step') {
      stepNumber++;
      const anchor = sourceMeta?.get(block.id)?.anchor ?? uniqueAnchor(`buoc-${stepNumber}`);
      meta.set(block.id, { anchor, stepNumber, docId });
      toc.push({ anchor, label: block.props.title || '', depth: 2, stepNumber });
    } else {
      meta.set(block.id, { docId });
    }
  }

  return { meta, toc };
}
