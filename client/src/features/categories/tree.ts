// ============================================================
// features/categories/tree.ts — Dựng cây thể loại từ danh sách phẳng
// ============================================================
// Server trả danh sách PHẲNG, mỗi thể loại có parentId:
//   [{ id: '1', name: 'IT', parentId: null }, { id: '2', name: 'AI', parentId: '1' }, ...]
// File này dựng thành cây để vẽ:
//   IT
//   └── AI
// 🔸 Flutter: giống tự dựng List<TreeNode> từ JSON phẳng trước khi đưa vào TreeView.

import type { Category } from '../../lib/types.ts';

export type CategoryNode = {
  category: Category;
  children: CategoryNode[];
  depth: number; // 0 = cấp cao nhất
  totalCount: number; // số tài liệu của CẢ nhánh (chính nó + mọi con cháu)
};

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byParent = new Map<string | null, Category[]>();
  const ids = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    // Cha không còn tồn tại (dữ liệu lệch) -> coi như cấp cao nhất, không mất thể loại.
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), c]);
  }

  // `seen` chặn vòng lặp vô hạn nếu dữ liệu lỡ bị vòng (server đã chặn, đây là lớp phòng hờ).
  const seen = new Set<string>();
  const build = (parentId: string | null, depth: number): CategoryNode[] =>
    (byParent.get(parentId) ?? [])
      .filter((c) => !seen.has(c.id) && seen.add(c.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => {
        const children = build(category.id, depth + 1);
        const totalCount = category.docCount + children.reduce((sum, child) => sum + child.totalCount, 0);
        return { category, children, depth, totalCount };
      });

  return build(null, 0);
}

// Duỗi cây thành danh sách theo đúng thứ tự hiển thị (cha trước, con ngay sau).
// Dùng cho ô chọn thể loại và bảng quản lý.
export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

// Chuỗi tổ tiên từ gốc tới chính nó: AI -> [IT, AI]. Dùng cho breadcrumb.
export function categoryPath(categories: Category[], id: string | null | undefined): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: Category[] = [];
  let current = id ? byId.get(id) : undefined;
  while (current && !path.includes(current)) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

// Id của một thể loại + mọi con cháu — để không cho chọn làm "thể loại cha"
// của chính nó (sẽ tạo vòng lặp).
export function subtreeIds(categories: Category[], id: string): Set<string> {
  const result = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const c of categories) {
      if (c.parentId && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id);
        added = true;
      }
    }
  }
  return result;
}

// Nhãn thụt lề cho thẻ <option> (option không có CSS padding):
//   "IT", "   └ AI", "      └ LLM"
export function indentedLabel(node: CategoryNode): string {
  return node.depth === 0 ? node.category.name : `${'   '.repeat(node.depth)}└ ${node.category.name}`;
}
