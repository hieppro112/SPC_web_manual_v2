// ============================================================
// repositories/documents.ts — SQL của Documents + DocumentVersions
// ============================================================
// Cột Blocks lưu nguyên mảng khối dạng chuỗi JSON:
//   ghi:  JSON.stringify(blocks)   🔸 Flutter: jsonEncode
//   đọc:  JSON.parse(row.Blocks)   🔸 Flutter: jsonDecode
// Tên thể loại / người sửa lấy bằng LEFT JOIN trong cùng một câu SQL
// (hồi MongoDB phải "populate" = thêm truy vấn riêng).

import { escapeLike, execute, query, queryOne, type Tx } from '../db/pool.ts';
import type { ParsedBlock } from '../blocks/schemas.ts';

export const DOC_STATUSES = ['draft', 'published'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

// ---------- Đọc ----------

type DocRow = {
  Id: number;
  Title: string;
  Slug: string;
  Status: DocStatus;
  Version: number;
  Description: string;
  CreatedAt: Date;
  UpdatedAt: Date;
  CreatedById: number | null;
  CategoryId: number | null;
  CategoryName: string | null;
  CategoryIconName: string | null;
  UpdatedById: number | null;
  UpdatedByName: string | null;
  Blocks?: string;
};

// Cột chung cho danh sách và chi tiết. KHÔNG lấy SearchText (nặng, client không cần).
const DOC_SELECT = `
  SELECT d.Id, d.Title, d.Slug, d.Status, d.Version, d.Description, d.CreatedAt, d.UpdatedAt, d.CreatedById,
         c.Id AS CategoryId, c.Name AS CategoryName, c.IconName AS CategoryIconName,
         u.Id AS UpdatedById, u.DisplayName AS UpdatedByName`;
const DOC_FROM = `
  FROM WebManualDocuments d
  LEFT JOIN WebManualCategories c ON c.Id = d.CategoryId
  LEFT JOIN WebManualUsers u ON u.Id = d.UpdatedById`;

// Đổi một dòng SQL thành đúng hình dạng JSON mà client đang dùng.
function toJson(row: DocRow) {
  return {
    id: String(row.Id),
    title: row.Title,
    slug: row.Slug,
    status: row.Status,
    version: row.Version,
    desc: row.Description,
    category: row.CategoryId ? { id: String(row.CategoryId), name: row.CategoryName, iconName: row.CategoryIconName } : null,
    updatedBy: row.UpdatedById ? { id: String(row.UpdatedById), displayName: row.UpdatedByName } : null,
    createdBy: row.CreatedById ? String(row.CreatedById) : null,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    ...(row.Blocks !== undefined ? { blocks: JSON.parse(row.Blocks) as ParsedBlock[] } : {}),
  };
}

export type DocListFilter = { status?: DocStatus; categoryId?: number | null; words?: string[] };

export async function listDocuments(filter: DocListFilter) {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.status) {
    where.push('d.Status = @status');
    params.status = filter.status;
  }
  if (filter.categoryId) {
    where.push('d.CategoryId = @categoryId');
    params.categoryId = filter.categoryId;
  }
  // Tìm kiếm: MỌI từ phải có trong SearchText (đã bỏ dấu). Mỗi từ là một
  // tham số riêng @w0, @w1... — không bao giờ ghép chữ người dùng gõ vào SQL.
  (filter.words ?? []).forEach((word, i) => {
    where.push(`d.SearchText LIKE @w${i}`);
    params[`w${i}`] = `%${escapeLike(word)}%`;
  });

  const rows = await query<DocRow>(
    `${DOC_SELECT} ${DOC_FROM}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY d.UpdatedAt DESC, d.Id DESC
     OFFSET 0 ROWS FETCH NEXT 500 ROWS ONLY`,
    params,
  );
  return rows.map(toJson);
}

export async function findDocumentBySlug(slug: string) {
  const row = await queryOne<DocRow>(`${DOC_SELECT}, d.Blocks ${DOC_FROM} WHERE d.Slug = @slug`, { slug });
  return row && toJson(row);
}

export async function findDocumentById(id: number, tx?: Tx) {
  const row = await queryOne<DocRow>(`${DOC_SELECT}, d.Blocks ${DOC_FROM} WHERE d.Id = @id`, { id }, tx);
  return row && toJson(row);
}

export type FullDocument = NonNullable<Awaited<ReturnType<typeof findDocumentById>>>;

export async function slugExists(slug: string): Promise<boolean> {
  return !!(await queryOne('SELECT 1 AS Found FROM WebManualDocuments WHERE Slug = @slug', { slug }));
}

// ---------- Ghi (luôn gọi qua services/documents.ts để có bản chụp phiên bản) ----------

export type DocumentRecord = {
  title: string;
  categoryId: number;
  status: DocStatus;
  blocks: ParsedBlock[];
  desc: string;
  searchText: string;
};

export async function insertDocument(data: DocumentRecord & { slug: string; userId: number }, tx: Tx): Promise<number> {
  const row = await queryOne<{ Id: number }>(
    `INSERT INTO WebManualDocuments (Title, Slug, CategoryId, Status, Blocks, Version, Description, SearchText, CreatedById, UpdatedById)
     OUTPUT INSERTED.Id
     VALUES (@title, @slug, @categoryId, @status, @blocks, 1, @desc, @searchText, @userId, @userId)`,
    { ...data, blocks: JSON.stringify(data.blocks) },
    tx,
  );
  return row!.Id;
}

// Tăng Version lên 1 và trả về số phiên bản MỚI.
export async function updateDocumentRow(id: number, data: DocumentRecord & { userId: number }, tx: Tx): Promise<number> {
  const row = await queryOne<{ Version: number }>(
    `UPDATE WebManualDocuments
     SET Title = @title, CategoryId = @categoryId, Status = @status, Blocks = @blocks,
         Description = @desc, SearchText = @searchText, UpdatedById = @userId,
         Version = Version + 1, UpdatedAt = SYSUTCDATETIME()
     OUTPUT INSERTED.Version
     WHERE Id = @id`,
    { ...data, id, blocks: JSON.stringify(data.blocks) },
    tx,
  );
  return row!.Version;
}

export async function deleteDocument(id: number): Promise<boolean> {
  // DocumentVersions có ON DELETE CASCADE -> các phiên bản tự xóa theo.
  return (await execute('DELETE FROM WebManualDocuments WHERE Id = @id', { id })) > 0;
}

// ---------- Phiên bản ----------

export async function insertVersion(
  data: { documentId: number; version: number; title: string; categoryId: number; status: DocStatus; blocks: ParsedBlock[]; userId: number; restoredFrom: number | null },
  tx: Tx,
): Promise<void> {
  await execute(
    `INSERT INTO WebManualDocumentVersions (DocumentId, Version, Title, CategoryId, Status, Blocks, SavedById, RestoredFrom)
     VALUES (@documentId, @version, @title, @categoryId, @status, @blocks, @userId, @restoredFrom)`,
    { ...data, blocks: JSON.stringify(data.blocks) },
    tx,
  );
}

type VersionRow = {
  Id: number;
  Version: number;
  Title: string;
  Status: DocStatus;
  RestoredFrom: number | null;
  CreatedAt: Date;
  SavedById: number | null;
  SavedByName: string | null;
  CategoryId?: number | null;
  CategoryName?: string | null;
  CategoryIconName?: string | null;
  Blocks?: string;
};

function versionToJson(row: VersionRow) {
  return {
    id: String(row.Id),
    version: row.Version,
    title: row.Title,
    status: row.Status,
    restoredFrom: row.RestoredFrom,
    createdAt: row.CreatedAt,
    savedBy: row.SavedById ? { id: String(row.SavedById), displayName: row.SavedByName } : null,
    ...(row.Blocks !== undefined
      ? {
          blocks: JSON.parse(row.Blocks) as ParsedBlock[],
          category: row.CategoryName ? { id: String(row.CategoryId), name: row.CategoryName, iconName: row.CategoryIconName } : null,
        }
      : {}),
  };
}

export async function listVersions(documentId: number) {
  const rows = await query<VersionRow>(
    `SELECT v.Id, v.Version, v.Title, v.Status, v.RestoredFrom, v.CreatedAt, u.Id AS SavedById, u.DisplayName AS SavedByName
     FROM WebManualDocumentVersions v LEFT JOIN WebManualUsers u ON u.Id = v.SavedById
     WHERE v.DocumentId = @documentId
     ORDER BY v.Version DESC`,
    { documentId },
  );
  return rows.map(versionToJson);
}

export async function findVersion(documentId: number, version: number) {
  const row = await queryOne<VersionRow>(
    `SELECT v.Id, v.Version, v.Title, v.Status, v.RestoredFrom, v.CreatedAt, v.Blocks,
            u.Id AS SavedById, u.DisplayName AS SavedByName,
            c.Id AS CategoryId, c.Name AS CategoryName, c.IconName AS CategoryIconName
     FROM WebManualDocumentVersions v
     LEFT JOIN WebManualUsers u ON u.Id = v.SavedById
     LEFT JOIN WebManualCategories c ON c.Id = v.CategoryId
     WHERE v.DocumentId = @documentId AND v.Version = @version`,
    { documentId, version },
  );
  return row && versionToJson(row);
}

// Dữ liệu cần để KHÔI PHỤC một phiên bản. CategoryId lấy nguyên giá trị
// trong bản chụp (có thể là thể loại đã bị xóa — nơi gọi tự kiểm tra).
export async function findVersionForRestore(documentId: number, version: number) {
  const row = await queryOne<{ Version: number; Title: string; CategoryId: number | null; Blocks: string }>(
    'SELECT Version, Title, CategoryId, Blocks FROM WebManualDocumentVersions WHERE DocumentId = @documentId AND Version = @version',
    { documentId, version },
  );
  return row && { version: row.Version, title: row.Title, categoryId: row.CategoryId, blocks: JSON.parse(row.Blocks) as ParsedBlock[] };
}
