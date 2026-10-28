// ============================================================
// repositories/categories.ts — Mọi câu SQL của bảng Categories
// ============================================================
// Thể loại dạng cây: ParentId trỏ tới thể loại cha (NULL = cấp cao nhất).
// Các phép tính trên cây (con cháu, chống vòng lặp) nằm ở
// services/categoryTree.ts; file này chỉ đọc/ghi dữ liệu.

import { execute, query, queryOne, type Tx } from '../db/pool.ts';
import type { CategoryLink } from '../services/categoryTree.ts';

type CategoryRow = { Id: number; Name: string; IconName: string; ParentId: number | null; IsShared: boolean; CreatedAt: Date; UpdatedAt: Date };

const COLUMNS = 'Id, Name, IconName, ParentId, IsShared, CreatedAt, UpdatedAt';

function toJson(row: CategoryRow) {
  return {
    id: String(row.Id),
    name: row.Name,
    iconName: row.IconName,
    // Id dạng chuỗi giống mọi id khác gửi cho client; null = cấp cao nhất
    parentId: row.ParentId === null ? null : String(row.ParentId),
    // Dùng chung cho mọi bộ phận (+ khách) — xem services/access.ts
    isShared: !!row.IsShared,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

// Danh sách phẳng + số tài liệu TRỰC TIẾP của từng thể loại (một câu SQL,
// LEFT JOIN + GROUP BY). Client tự dựng cây và cộng dồn số đếm theo nhánh.
// Khách chỉ đếm bài đã xuất bản — đúng với những gì khách nhìn thấy.
export async function listCategoriesWithCount(onlyPublished: boolean) {
  const rows = await query<CategoryRow & { DocCount: number }>(
    `SELECT c.Id, c.Name, c.IconName, c.ParentId, c.IsShared, c.CreatedAt, c.UpdatedAt, COUNT(d.Id) AS DocCount
     FROM WebManualCategories c
     LEFT JOIN WebManualDocuments d ON d.CategoryId = c.Id AND (@onlyPublished = 0 OR d.Status = N'published')
     GROUP BY c.Id, c.Name, c.IconName, c.ParentId, c.IsShared, c.CreatedAt, c.UpdatedAt
     ORDER BY c.Name`,
    { onlyPublished: onlyPublished ? 1 : 0 },
  );
  return rows.map((r) => ({ ...toJson(r), docCount: r.DocCount }));
}

// Chỉ quan hệ cha-con (Id, ParentId) — để tính con cháu / chống vòng lặp.
export async function listCategoryLinks(): Promise<CategoryLink[]> {
  const rows = await query<{ Id: number; ParentId: number | null }>('SELECT Id, ParentId FROM WebManualCategories');
  return rows.map((r) => ({ id: r.Id, parentId: r.ParentId }));
}

// Đủ thông tin để tính quyền xem theo bộ phận (services/access.ts).
// Cũng dùng để tạo mục mặc định (services/categoryDefaults.ts) -> nhận tx.
export async function listCategoriesForAccess(tx?: Tx): Promise<{ id: number; name: string; parentId: number | null; isShared: boolean }[]> {
  const rows = await query<{ Id: number; Name: string; ParentId: number | null; IsShared: boolean }>(
    'SELECT Id, Name, ParentId, IsShared FROM WebManualCategories',
    {},
    tx,
  );
  return rows.map((r) => ({ id: r.Id, name: r.Name, parentId: r.ParentId, isShared: !!r.IsShared }));
}

export async function findCategoryById(id: number) {
  const row = await queryOne<CategoryRow>(`SELECT ${COLUMNS} FROM WebManualCategories WHERE Id = @id`, { id });
  return row && toJson(row);
}

export async function categoryExists(id: number): Promise<boolean> {
  return !!(await queryOne('SELECT 1 AS Found FROM WebManualCategories WHERE Id = @id', { id }));
}

// tx: tạo trong transaction (vd tạo bộ phận + các mục mặc định: lỗi giữa chừng thì không còn gì dở dang).
export async function createCategory(name: string, iconName: string, parentId: number | null, isShared = false, tx?: Tx) {
  const row = await queryOne<CategoryRow>(
    `INSERT INTO WebManualCategories (Name, IconName, ParentId, IsShared)
     OUTPUT ${COLUMNS.split(', ').map((c) => `INSERTED.${c}`).join(', ')}
     VALUES (@name, @iconName, @parentId, @isShared)`,
    { name, iconName, parentId, isShared: isShared ? 1 : 0 },
    tx,
  );
  return toJson(row!);
}

// Đã có thể loại tên này ngay trong thể loại cha chưa (so không phân biệt hoa thường như SQL Server).
export async function findChildByName(parentId: number, name: string, tx?: Tx): Promise<number | null> {
  const row = await queryOne<{ Id: number }>('SELECT Id FROM WebManualCategories WHERE ParentId = @parentId AND Name = @name', { parentId, name }, tx);
  return row?.Id ?? null;
}

export async function updateCategory(id: number, name: string, iconName: string, parentId: number | null, isShared: boolean) {
  await execute(
    `UPDATE WebManualCategories
     SET Name = @name, IconName = @iconName, ParentId = @parentId, IsShared = @isShared, UpdatedAt = SYSUTCDATETIME()
     WHERE Id = @id`,
    { id, name, iconName, parentId, isShared: isShared ? 1 : 0 },
  );
  return findCategoryById(id);
}

export async function countDocumentsInCategory(id: number): Promise<number> {
  const row = await queryOne<{ Total: number }>('SELECT COUNT(*) AS Total FROM WebManualDocuments WHERE CategoryId = @id', { id });
  return row?.Total ?? 0;
}

export async function countChildCategories(id: number): Promise<number> {
  const row = await queryOne<{ Total: number }>('SELECT COUNT(*) AS Total FROM WebManualCategories WHERE ParentId = @id', { id });
  return row?.Total ?? 0;
}

export async function deleteCategory(id: number): Promise<void> {
  await execute('DELETE FROM WebManualCategories WHERE Id = @id', { id });
}
