// ============================================================
// services/categoryDefaults.ts — Chép "mục mặc định" vào các bộ phận
// ============================================================
// Cây mục mặc định (bảng CategoryTemplates):      Bộ phận "PE IT" sau khi chép:
//   Quy trình                                       PE IT
//   Biểu mẫu                                          ├ Quy trình
//     └ Nhân sự                                       ├ Biểu mẫu
//                                                     │   └ Nhân sự
//                                                     └ (các mục PE IT tự có giữ nguyên)
// Quy tắc: CHỈ THÊM mục còn thiếu (so theo tên trong cùng cha, không phân biệt hoa thường).
// Không bao giờ xóa / đổi tên / di chuyển thể loại đang có — bên trong có thể đã có bài.
//
// "Bộ phận" = thể loại cấp cao nhất KHÔNG dùng chung (Community, Hướng dẫn sử dụng...
// không có mục mặc định).

import { withTransaction, type Tx } from '../db/pool.ts';
import { createCategory, listCategoriesForAccess } from '../repositories/categories.ts';
import { listTemplates, type CategoryTemplate } from '../repositories/categoryTemplates.ts';
import { invalidateAccessCache, isSharedCategory } from './access.ts';

const norm = (s: string) => s.trim().toLowerCase();

// Mọi bộ phận hiện có (id thể loại cấp cao nhất, không dùng chung).
export async function departmentRootIds(tx?: Tx): Promise<number[]> {
  const rows = await listCategoriesForAccess(tx);
  return rows.filter((c) => c.parentId === null && !isSharedCategory(c)).map((c) => c.id);
}

// Chỉ chép một số mục: mục được chọn + toàn bộ mục cha của nó (để có chỗ đặt vào)
// + toàn bộ mục con cháu của nó. Dùng khi admin vừa thêm một mục mới vào danh sách.
export function branchOf(templates: CategoryTemplate[], id: string): Set<string> {
  const byId = new Map(templates.map((t) => [t.id, t]));
  // Đi LÊN: chính nó + các mục cha.
  const up = new Set<string>();
  for (let cur = byId.get(id); cur && !up.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) up.add(cur.id);
  // Đi XUỐNG: mọi mục con cháu (không lan sang anh em của các mục cha).
  const down = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const t of templates) {
      if (t.parentId && down.has(t.parentId) && !down.has(t.id)) {
        down.add(t.id);
        added = true;
      }
    }
  }
  return new Set([...up, ...down]);
}

// Chép cây mục mặc định vào các bộ phận `rootIds` (trong transaction `tx` có sẵn).
// only: chỉ chép các mục này (xem branchOf). Trả về số thể loại vừa tạo.
export async function applyDefaultsTx(tx: Tx, rootIds: number[], only?: Set<string>): Promise<number> {
  if (!rootIds.length) return 0;
  const templates = (await listTemplates(tx)).filter((t) => !only || only.has(t.id));
  // Thể loại hiện có, gom theo cha để tra "đã có mục tên X trong cha Y chưa".
  const children = new Map<number, Map<string, number>>();
  for (const c of await listCategoriesForAccess(tx)) {
    if (c.parentId === null) continue;
    if (!children.has(c.parentId)) children.set(c.parentId, new Map());
    children.get(c.parentId)!.set(norm(c.name), c.id);
  }

  let created = 0;
  // Đi theo cây mục mặc định: mỗi mục tìm (hoặc tạo) thể loại cùng tên trong cha tương ứng.
  const walk = async (templateParentId: string | null, categoryParentId: number) => {
    for (const t of templates.filter((x) => x.parentId === templateParentId)) {
      let id = children.get(categoryParentId)?.get(norm(t.name));
      if (id === undefined) {
        id = Number((await createCategory(t.name, t.iconName, categoryParentId, false, tx)).id);
        if (!children.has(categoryParentId)) children.set(categoryParentId, new Map());
        children.get(categoryParentId)!.set(norm(t.name), id);
        created++;
      }
      await walk(t.id, id);
    }
  };
  for (const rootId of rootIds) await walk(null, rootId);
  return created;
}

// Bản tự mở transaction: "Đồng bộ mục mặc định" cho mọi bộ phận / chép một mục mới.
export async function applyDefaults(rootIds?: number[], only?: Set<string>): Promise<number> {
  const created = await withTransaction(async (tx) => applyDefaultsTx(tx, rootIds ?? (await departmentRootIds(tx)), only));
  if (created) invalidateAccessCache();
  return created;
}
