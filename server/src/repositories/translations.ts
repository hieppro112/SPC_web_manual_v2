// ============================================================
// repositories/translations.ts — SQL của bản dịch + hàng đợi dịch
// ============================================================
// Hai bảng của migration 007. Chưa tạo bảng (chưa chạy server/sql/007) thì
// translationsReady() = false và MỌI tính năng dịch tự tắt: lưu bài, tìm
// kiếm, trợ lý AI vẫn chạy như cũ, không báo lỗi.

import { execute, query, queryOne } from '../db/pool.ts';
import type { ParsedBlock } from '../blocks/schemas.ts';

// ---------- Bảng đã có chưa? (nhớ kết quả, chưa có thì 5 phút hỏi lại một lần) ----------

let ready = false;
let checkedAt = 0;
export async function translationsReady(): Promise<boolean> {
  if (ready || Date.now() - checkedAt < 5 * 60_000) return ready;
  checkedAt = Date.now();
  const row = await queryOne<{ Found: number }>(
    `SELECT 1 AS Found WHERE OBJECT_ID(N'WebManualDocTranslations', N'U') IS NOT NULL
                          AND OBJECT_ID(N'WebManualTranslationJobs', N'U') IS NOT NULL`,
  ).catch(() => null);
  ready = !!row;
  return ready;
}
// Dùng chỗ không đợi được (ghép câu SQL tìm kiếm): giá trị đã biết gần nhất.
export const translationsReadyCached = () => ready;

// Bài hướng dẫn sử dụng đã có sẵn 3 bản riêng -> không dịch.
const NOT_GUIDE = `d.Slug NOT LIKE N'guide-%'`;

// ---------- Bản dịch ----------

type Row = {
  Lang: string;
  SourceLang: string;
  SourceVersion: number;
  Title: string;
  Description: string;
  Blocks: string;
  Hashes: string;
  EditedById: number | null;
  EditedByName: string | null;
  EditedAt: Date | null;
  UpdatedAt: Date;
};

function toJson(r: Row) {
  return {
    lang: r.Lang,
    sourceLang: r.SourceLang,
    sourceVersion: r.SourceVersion,
    title: r.Title,
    desc: r.Description,
    blocks: JSON.parse(r.Blocks) as ParsedBlock[],
    hashes: JSON.parse(r.Hashes) as Record<string, string>,
    editedBy: r.EditedByName,
    editedById: r.EditedById,
    editedAt: r.EditedAt,
    updatedAt: r.UpdatedAt,
  };
}
export type TranslationRow = ReturnType<typeof toJson>;

export async function listTranslations(documentId: number): Promise<TranslationRow[]> {
  const rows = await query<Row>(
    `SELECT t.Lang, t.SourceLang, t.SourceVersion, t.Title, t.Description, t.Blocks, t.Hashes,
            t.EditedById, u.DisplayName AS EditedByName, t.EditedAt, t.UpdatedAt
     FROM WebManualDocTranslations t LEFT JOIN WebManualUsers u ON u.Id = t.EditedById
     WHERE t.DocumentId = @documentId`,
    { documentId },
  );
  return rows.map(toJson);
}

export type TranslationWrite = {
  documentId: number;
  lang: string;
  sourceLang: string;
  sourceVersion: number;
  title: string;
  desc: string;
  blocks: ParsedBlock[];
  hashes: Record<string, string>;
  searchText: string;
  clearEdit: boolean; // dịch lại từ đầu -> bỏ thông tin "đã sửa tay"
};

export async function saveTranslation(t: TranslationWrite): Promise<void> {
  await execute(
    `MERGE WebManualDocTranslations WITH (HOLDLOCK) AS dst
     USING (SELECT @documentId AS DocumentId, @lang AS Lang) AS src
       ON dst.DocumentId = src.DocumentId AND dst.Lang = src.Lang
     WHEN MATCHED THEN UPDATE SET
       SourceLang = @sourceLang, SourceVersion = @sourceVersion, Title = @title, Description = @desc,
       Blocks = @blocks, Hashes = @hashes, SearchText = @searchText, UpdatedAt = SYSUTCDATETIME(),
       EditedById = CASE WHEN @clearEdit = 1 THEN NULL ELSE dst.EditedById END,
       EditedAt = CASE WHEN @clearEdit = 1 THEN NULL ELSE dst.EditedAt END
     WHEN NOT MATCHED THEN INSERT (DocumentId, Lang, SourceLang, SourceVersion, Title, Description, Blocks, Hashes, SearchText)
       VALUES (@documentId, @lang, @sourceLang, @sourceVersion, @title, @desc, @blocks, @hashes, @searchText);`,
    {
      ...t,
      title: t.title.slice(0, 300),
      desc: t.desc.slice(0, 500),
      blocks: JSON.stringify(t.blocks),
      hashes: JSON.stringify(t.hashes),
      clearEdit: t.clearEdit ? 1 : 0,
    },
  );
}

// Editor sửa tay bản dịch.
export async function saveTranslationEdit(
  documentId: number,
  lang: string,
  data: { title: string; desc: string; blocks: ParsedBlock[]; searchText: string },
  userId: number,
): Promise<boolean> {
  return (
    (await execute(
      `UPDATE WebManualDocTranslations
       SET Title = @title, Description = @desc, Blocks = @blocks, SearchText = @searchText,
           EditedById = @userId, EditedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
       WHERE DocumentId = @documentId AND Lang = @lang`,
      { documentId, lang, title: data.title.slice(0, 300), desc: data.desc.slice(0, 500), blocks: JSON.stringify(data.blocks), searchText: data.searchText, userId },
    )) > 0
  );
}

// Bài gốc đổi sang ngôn ngữ khác (vd viết lại bằng tiếng Nhật) -> bỏ bản dịch trùng ngôn ngữ gốc.
export async function deleteTranslation(documentId: number, lang: string): Promise<void> {
  await execute('DELETE FROM WebManualDocTranslations WHERE DocumentId = @documentId AND Lang = @lang', { documentId, lang });
}

// Tiêu đề + mô tả đã dịch cho danh sách tài liệu (thẻ ở trang chủ).
export async function translatedTitles(lang: string, documentIds: number[]): Promise<Map<string, { title: string; desc: string }>> {
  const map = new Map<string, { title: string; desc: string }>();
  if (!documentIds.length || !(await translationsReady())) return map;
  // OPENJSON: truyền cả danh sách id thành MỘT tham số chuỗi JSON (không ghép số vào câu SQL).
  const rows = await query<{ DocumentId: number; Title: string; Description: string }>(
    `SELECT t.DocumentId, t.Title, t.Description FROM WebManualDocTranslations t
     WHERE t.Lang = @lang AND t.DocumentId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`,
    { lang, ids: JSON.stringify(documentIds) },
  );
  for (const r of rows) map.set(String(r.DocumentId), { title: r.Title, desc: r.Description });
  return map;
}

// Dấu thời gian bản dịch của mọi bài (trợ lý AI dùng để biết khi nào lập chỉ mục lại).
export async function translationStamps(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!(await translationsReady())) return map;
  const rows = await query<{ DocumentId: number; Last: Date; N: number }>(
    'SELECT DocumentId, MAX(UpdatedAt) AS Last, COUNT(*) AS N FROM WebManualDocTranslations GROUP BY DocumentId',
  );
  for (const r of rows) map.set(String(r.DocumentId), `${r.Last.toISOString()}#${r.N}`);
  return map;
}

// ---------- Hàng đợi ----------

// Lưu bài -> MỘT dòng việc cho bài đó (đã có thì chỉ nâng phiên bản cần dịch).
// Đang có worker làm dở thì để nó làm xong; xong mà thấy phiên bản mới hơn sẽ tự làm tiếp.
export async function enqueueTranslation(documentId: number, version: number, priority: 0 | 1, force = false): Promise<void> {
  await execute(
    `MERGE WebManualTranslationJobs WITH (HOLDLOCK) AS dst
     USING (SELECT @documentId AS DocumentId) AS src ON dst.DocumentId = src.DocumentId
     WHEN MATCHED THEN UPDATE SET
       RequestedVersion = CASE WHEN @version > dst.RequestedVersion THEN @version ELSE dst.RequestedVersion END,
       Priority = CASE WHEN @priority > dst.Priority THEN @priority ELSE dst.Priority END,
       Force = CASE WHEN @force = 1 THEN 1 ELSE dst.Force END,
       Status = CASE WHEN dst.Status = N'processing' THEN dst.Status ELSE N'pending' END,
       Attempts = CASE WHEN dst.Status = N'processing' THEN dst.Attempts ELSE 0 END,
       Error = NULL, UpdatedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (DocumentId, RequestedVersion, Priority, Force)
       VALUES (@documentId, @version, @priority, @force);`,
    { documentId, version, priority, force: force ? 1 : 0 },
  );
}

// Quét định kỳ: bài nào thiếu bản dịch cho phiên bản hiện tại mà chưa có trong hàng đợi
// -> thêm vào (ưu tiên thấp). Lần đầu chạy = dịch bù toàn bộ bài cũ.
// Việc lỗi quá 24 giờ được thử lại.
export async function sweepTranslations(): Promise<number> {
  await execute(
    `UPDATE WebManualTranslationJobs SET Status = N'pending', Attempts = 0, Error = NULL, UpdatedAt = SYSUTCDATETIME()
     WHERE Status = N'failed' AND UpdatedAt < DATEADD(HOUR, -24, SYSUTCDATETIME())`,
  );
  return execute(
    `INSERT INTO WebManualTranslationJobs (DocumentId, RequestedVersion, Priority)
     SELECT d.Id, d.Version, 0 FROM WebManualDocuments d
     WHERE ${NOT_GUIDE}
       AND NOT EXISTS (SELECT 1 FROM WebManualTranslationJobs j WHERE j.DocumentId = d.Id)
       AND (SELECT COUNT(*) FROM WebManualDocTranslations t WHERE t.DocumentId = d.Id AND t.SourceVersion = d.Version) < 2`,
  );
}

// Nhận việc nguyên tử (giống claimNextJob trong quizJobs.ts): việc vừa lưu bài làm trước.
export async function claimNextTranslation(leaseMinutes: number): Promise<{ documentId: number; force: boolean } | null> {
  const row = await queryOne<{ DocumentId: number; Force: boolean }>(
    `WITH next AS (
       SELECT TOP 1 * FROM WebManualTranslationJobs WITH (UPDLOCK, READPAST, ROWLOCK)
       WHERE Status = N'pending'
          OR (Status = N'processing' AND ClaimedAt < DATEADD(MINUTE, -@leaseMinutes, SYSUTCDATETIME()))
       ORDER BY Priority DESC, UpdatedAt, DocumentId
     )
     UPDATE next SET Status = N'processing', ClaimedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
     OUTPUT INSERTED.DocumentId, INSERTED.Force`,
    { leaseMinutes },
  );
  return row && { documentId: row.DocumentId, force: !!row.Force };
}

export async function jobForceFlag(documentId: number): Promise<boolean> {
  const row = await queryOne<{ Force: boolean }>('SELECT Force FROM WebManualTranslationJobs WHERE DocumentId = @documentId', { documentId });
  return !!row?.Force;
}

// Dịch xong phiên bản `version`. Trong lúc dịch mà bài được lưu tiếp (phiên bản mới hơn)
// thì giữ dòng việc, đưa về "chờ" để dịch tiếp phần mới.
export async function finishTranslationJob(documentId: number, version: number): Promise<void> {
  await execute('DELETE FROM WebManualTranslationJobs WHERE DocumentId = @documentId AND RequestedVersion <= @version', { documentId, version });
  await execute(
    `UPDATE WebManualTranslationJobs SET Status = N'pending', Force = 0, Attempts = 0, ClaimedAt = NULL, Error = NULL, UpdatedAt = SYSUTCDATETIME()
     WHERE DocumentId = @documentId`,
    { documentId },
  );
}

export async function dropTranslationJob(documentId: number): Promise<void> {
  await execute('DELETE FROM WebManualTranslationJobs WHERE DocumentId = @documentId', { documentId });
}

// Lỗi: thử lại tối đa 3 lần, sau đó để "failed" (lượt quét sau 24 giờ thử lại).
export async function failTranslationJob(documentId: number, error: string): Promise<void> {
  await execute(
    `UPDATE WebManualTranslationJobs
     SET Attempts = Attempts + 1,
         Status = CASE WHEN Attempts + 1 >= 3 THEN N'failed' ELSE N'pending' END,
         Error = @error, ClaimedAt = NULL, UpdatedAt = SYSUTCDATETIME()
     WHERE DocumentId = @documentId`,
    { documentId, error: error.slice(0, 1000) },
  );
}

export async function translationJobState(documentId: number): Promise<'pending' | 'processing' | 'failed' | null> {
  const row = await queryOne<{ Status: 'pending' | 'processing' | 'failed' }>(
    'SELECT Status FROM WebManualTranslationJobs WHERE DocumentId = @documentId',
    { documentId },
  );
  return row?.Status ?? null;
}
