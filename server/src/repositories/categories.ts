// ============================================================
// repositories/categories.ts — Mọi câu SQL của bảng Categories
// ============================================================

import { execute, query, queryOne } from '../db/pool.ts';

type CategoryRow = { Id: number; Name: string; IconName: string; CreatedAt: Date; UpdatedAt: Date };

function toJson(row: CategoryRow) {
  return { id: String(row.Id), name: row.Name, iconName: row.IconName, createdAt: row.CreatedAt, updatedAt: row.UpdatedAt };
}

// Danh sách + số tài liệu mỗi thể loại, bằng MỘT câu SQL (LEFT JOIN + GROUP BY).
// LEFT JOIN: thể loại chưa có tài liệu nào vẫn hiện, với số đếm 0.
// Khách chỉ đếm bài đã xuất bản — đúng với những gì khách nhìn thấy.
export async function listCategoriesWithCount(onlyPublished: boolean) {
  const rows = await query<CategoryRow & { DocCount: number }>(
    `SELECT c.Id, c.Name, c.IconName, c.CreatedAt, c.UpdatedAt, COUNT(d.Id) AS DocCount
     FROM WebManualCategories c
     LEFT JOIN WebManualDocuments d ON d.CategoryId = c.Id AND (@onlyPublished = 0 OR d.Status = N'published')
     GROUP BY c.Id, c.Name, c.IconName, c.CreatedAt, c.UpdatedAt
     ORDER BY c.Name`,
    { onlyPublished: onlyPublished ? 1 : 0 },
  );
  return rows.map((r) => ({ ...toJson(r), docCount: r.DocCount }));
}

export async function findCategoryById(id: number) {
  const row = await queryOne<CategoryRow>('SELECT Id, Name, IconName, CreatedAt, UpdatedAt FROM WebManualCategories WHERE Id = @id', { id });
  return row && toJson(row);
}

export async function categoryExists(id: number): Promise<boolean> {
  return !!(await queryOne('SELECT 1 AS Found FROM WebManualCategories WHERE Id = @id', { id }));
}

export async function createCategory(name: string, iconName: string) {
  const row = await queryOne<CategoryRow>(
    `INSERT INTO WebManualCategories (Name, IconName)
     OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.IconName, INSERTED.CreatedAt, INSERTED.UpdatedAt
     VALUES (@name, @iconName)`,
    { name, iconName },
  );
  return toJson(row!);
}

export async function updateCategory(id: number, name: string, iconName: string) {
  await execute(
    'UPDATE WebManualCategories SET Name = @name, IconName = @iconName, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id',
    { id, name, iconName },
  );
  return findCategoryById(id);
}

export async function countDocumentsInCategory(id: number): Promise<number> {
  const row = await queryOne<{ Total: number }>('SELECT COUNT(*) AS Total FROM WebManualDocuments WHERE CategoryId = @id', { id });
  return row?.Total ?? 0;
}

export async function deleteCategory(id: number): Promise<void> {
  await execute('DELETE FROM WebManualCategories WHERE Id = @id', { id });
}
