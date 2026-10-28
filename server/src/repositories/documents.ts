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
import { translationsReadyCached } from './translations.ts';

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
  Cover?: string | null;
  TextLength?: number;
};

// Chỉ danh sách (thẻ ở trang chủ) mới cần:
//   Cover      = ảnh bìa: ảnh đầu tiên trong bài (khối Ảnh / ảnh của khối Bước);
//                bài không có ảnh thì lấy hình khối Sơ đồ; không có gì -> NULL.
//                OPENJSON đọc mảng khối ngay trong SQL, không phải tải cả Blocks về Node.
//   TextLength = số ký tự chữ của bài, để ước tính thời gian đọc.
const COVER_SRC = `COALESCE(NULLIF(JSON_VALUE(b.value, '$.props.src'), ''), NULLIF(JSON_VALUE(b.value, '$.props.image'), ''))`;
const LIST_EXTRA = `,
  (SELECT TOP 1 ${COVER_SRC} FROM OPENJSON(d.Blocks) b
   WHERE JSON_VALUE(b.value, '$.type') IN ('image', 'step', 'diagram') AND ${COVER_SRC} IS NOT NULL
   ORDER BY CASE JSON_VALUE(b.value, '$.type') WHEN 'diagram' THEN 1 ELSE 0 END, CAST(b.[key] AS INT)) AS Cover,
  LEN(d.SearchText) AS TextLength`;

// Ước tính phút đọc: khoảng 1000 ký tự / phút (tiếng Việt ~200 từ / phút), tối thiểu 1 phút.
const CHARS_PER_MINUTE = 1000;

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
    ...(row.TextLength !== undefined
      ? { cover: row.Cover ?? null, readMinutes: Math.max(1, Math.round(row.TextLength / CHARS_PER_MINUTE)) }
      : {}),
  };
}

// categoryIds: thể loại được chọn + mọi thể loại con cháu (tính sẵn ở route),
// để bấm "IT" thì thấy cả tài liệu của "AI" nằm bên trong.
// ids: chỉ lấy đúng các bài này (vd trang "Bài tôi yêu thích").
export type DocListFilter = { status?: DocStatus; categoryIds?: number[]; words?: string[]; ids?: number[] };

export async function listDocuments(filter: DocListFilter) {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.status) {
    where.push('d.Status = @status');
    params.status = filter.status;
  }
  if (filter.categoryIds?.length) {
    // Mỗi id một tham số riêng (@c0, @c1...) -> d.CategoryId IN (@c0, @c1, ...)
    const names = filter.categoryIds.map((id, i) => {
      params[`c${i}`] = id;
      return `@c${i}`;
    });
    where.push(`d.CategoryId IN (${names.join(', ')})`);
  }
  if (filter.ids) {
    where.push('d.Id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))');
    params.ids = JSON.stringify(filter.ids);
  }
  // Tìm kiếm: MỌI từ phải có trong SearchText (đã bỏ dấu). Mỗi từ là một
  // tham số riêng @w0, @w1... — không bao giờ ghép chữ người dùng gõ vào SQL.
  // Có bản dịch (migration 007) thì tìm cả trong chữ của bản dịch: người Nhật
  // gõ tiếng Nhật vẫn ra bài viết bằng tiếng Việt.
  const words = filter.words ?? [];
  words.forEach((word, i) => {
    params[`w${i}`] = `%${escapeLike(word)}%`;
  });
  if (words.length) {
    const own = words.map((_, i) => `d.SearchText LIKE @w${i}`).join(' AND ');
    if (translationsReadyCached()) {
      const translated = words.map((_, i) => `t.SearchText LIKE @w${i}`).join(' AND ');
      where.push(`((${own}) OR EXISTS (SELECT 1 FROM WebManualDocTranslations t WHERE t.DocumentId = d.Id AND ${translated}))`);
    } else {
      where.push(own);
    }
  }

  const rows = await query<DocRow>(
    `${DOC_SELECT} ${LIST_EXTRA} ${DOC_FROM}
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

// Danh sách gọn mọi bài đã xuất bản — trợ lý AI dùng để biết bài nào mới/sửa/xóa.
export async function listPublishedStamps() {
  const rows = await query<{ Id: number; UpdatedAt: Date }>(
    `SELECT Id, UpdatedAt FROM WebManualDocuments WHERE Status = N'published'`,
  );
  return rows.map((r) => ({ id: String(r.Id), updatedAt: r.UpdatedAt.toISOString() }));
}

// Thể loại của từng tài liệu (để lọc theo bộ phận: đề kiểm tra, trợ lý AI...).
export async function docCategoryMap(documentIds: number[]): Promise<Map<number, number | null>> {
  if (!documentIds.length) return new Map();
  const rows = await query<{ Id: number; CategoryId: number | null }>(
    'SELECT Id, CategoryId FROM WebManualDocuments WHERE Id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))',
    { ids: JSON.stringify([...new Set(documentIds)]) },
  );
  return new Map(rows.map((r) => [r.Id, r.CategoryId]));
}

// Id mọi tài liệu thuộc các thể loại này.
export async function docIdsInCategories(categoryIds: number[]): Promise<Set<number>> {
  if (!categoryIds.length) return new Set();
  const rows = await query<{ Id: number }>(
    'SELECT Id FROM WebManualDocuments WHERE CategoryId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))',
    { ids: JSON.stringify(categoryIds) },
  );
  return new Set(rows.map((r) => r.Id));
}

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
