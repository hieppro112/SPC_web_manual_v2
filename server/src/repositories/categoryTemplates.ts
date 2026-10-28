// ============================================================
// repositories/categoryTemplates.ts — Cây "mục mặc định" của mọi bộ phận (migration 011)
// ============================================================
// Giống bảng thể loại: ParentId trỏ tới mục cha trong cây (NULL = mục con trực tiếp
// của bộ phận). Tạo bộ phận mới -> chép cả cây này vào (services/categoryDefaults.ts).

import { execute, query, queryOne, type Tx } from '../db/pool.ts';

type Row = { Id: number; Name: string; IconName: string; ParentId: number | null };

const toJson = (r: Row) => ({ id: String(r.Id), name: r.Name, iconName: r.IconName, parentId: r.ParentId === null ? null : String(r.ParentId) });
export type CategoryTemplate = ReturnType<typeof toJson>;

export async function listTemplates(tx?: Tx): Promise<CategoryTemplate[]> {
  const rows = await query<Row>('SELECT Id, Name, IconName, ParentId FROM WebManualCategoryTemplates ORDER BY Name', {}, tx);
  return rows.map(toJson);
}

export async function findTemplate(id: number): Promise<CategoryTemplate | null> {
  const row = await queryOne<Row>('SELECT Id, Name, IconName, ParentId FROM WebManualCategoryTemplates WHERE Id = @id', { id });
  return row && toJson(row);
}

export async function createTemplate(name: string, iconName: string, parentId: number | null): Promise<CategoryTemplate> {
  const row = await queryOne<Row>(
    `INSERT INTO WebManualCategoryTemplates (Name, IconName, ParentId)
     OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.IconName, INSERTED.ParentId
     VALUES (@name, @iconName, @parentId)`,
    { name, iconName, parentId },
  );
  return toJson(row!);
}

export async function updateTemplate(id: number, name: string, iconName: string, parentId: number | null): Promise<void> {
  await execute(
    `UPDATE WebManualCategoryTemplates SET Name = @name, IconName = @iconName, ParentId = @parentId, UpdatedAt = SYSUTCDATETIME()
     WHERE Id = @id`,
    { id, name, iconName, parentId },
  );
}

// Xóa một mục + toàn bộ mục con cháu (CTE đệ quy gom cả nhánh, xóa trong một câu).
// Chỉ xóa trong DANH SÁCH MẶC ĐỊNH — thể loại thật ở các bộ phận giữ nguyên.
export async function deleteTemplateBranch(id: number): Promise<void> {
  await execute(
    `WITH branch AS (
       SELECT Id FROM WebManualCategoryTemplates WHERE Id = @id
       UNION ALL
       SELECT t.Id FROM WebManualCategoryTemplates t JOIN branch b ON t.ParentId = b.Id
     )
     DELETE FROM WebManualCategoryTemplates WHERE Id IN (SELECT Id FROM branch)`,
    { id },
  );
}
