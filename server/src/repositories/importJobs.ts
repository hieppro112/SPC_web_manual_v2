// ============================================================
// repositories/importJobs.ts — SQL của hàng đợi "nhập bài từ PowerPoint"
// ============================================================
// Cấu trúc giống repositories/quizJobs.ts; khác ở chỗ có Payload (nội dung
// đã đọc sẵn từ file) và kết quả là một TÀI LIỆU nháp thay vì bộ đề.

import { execute, query, queryOne } from '../db/pool.ts';
import type { ImportPayload } from '../services/pptx/importPrompt.ts';
import type { QuizJobStatus as JobStatus } from './quizJobs.ts';

type JobRow = {
  Id: number;
  FileName: string;
  CategoryId: number | null;
  CategoryName: string | null;
  Language: string;
  SlideCount: number;
  Status: JobStatus;
  RequestedById: number | null;
  RequestedByName: string | null;
  DocumentId: number | null;
  DocumentSlug: string | null;
  Error: string | null;
  CompletedAt: Date | null;
  SeenAt: Date | null;
  CreatedAt: Date;
  Payload?: string;
};

// KHÔNG lấy Payload trong danh sách (có thể rất lớn) — chỉ lấy khi worker cần.
const JOB_SELECT = `
  SELECT j.Id, j.FileName, j.CategoryId, c.Name AS CategoryName, j.Language, j.SlideCount, j.Status,
         j.RequestedById, u.DisplayName AS RequestedByName, j.DocumentId, d.Slug AS DocumentSlug,
         j.Error, j.CompletedAt, j.SeenAt, j.CreatedAt`;
const JOB_FROM = `
  FROM WebManualImportJobs j
  LEFT JOIN WebManualCategories c ON c.Id = j.CategoryId
  LEFT JOIN WebManualUsers u ON u.Id = j.RequestedById
  LEFT JOIN WebManualDocuments d ON d.Id = j.DocumentId`;

function toJson(row: JobRow) {
  return {
    id: String(row.Id),
    fileName: row.FileName,
    categoryId: row.CategoryId !== null ? String(row.CategoryId) : null,
    categoryName: row.CategoryName,
    language: row.Language,
    slideCount: row.SlideCount,
    status: row.Status,
    requestedById: row.RequestedById !== null ? String(row.RequestedById) : null,
    requestedBy: row.RequestedByName,
    documentId: row.DocumentId !== null ? String(row.DocumentId) : null,
    documentSlug: row.DocumentSlug,
    error: row.Error,
    completedAt: row.CompletedAt,
    seenAt: row.SeenAt,
    createdAt: row.CreatedAt,
  };
}

export type ImportJob = ReturnType<typeof toJson>;

export async function expireOldImportJobs(hours: number): Promise<number> {
  return execute(
    `UPDATE WebManualImportJobs SET Status = N'expired', UpdatedAt = SYSUTCDATETIME()
     WHERE Status IN (N'pending', N'processing') AND CreatedAt < DATEADD(HOUR, -@hours, SYSUTCDATETIME())`,
    { hours },
  );
}

export async function createImportJob(data: {
  fileName: string;
  categoryId: number;
  language: string;
  payload: ImportPayload;
  requestedById: number;
}) {
  const row = await queryOne<{ Id: number }>(
    `INSERT INTO WebManualImportJobs (FileName, CategoryId, Language, SlideCount, Payload, RequestedById)
     OUTPUT INSERTED.Id VALUES (@fileName, @categoryId, @language, @slideCount, @payload, @requestedById)`,
    {
      fileName: data.fileName.slice(0, 260),
      categoryId: data.categoryId,
      language: data.language,
      slideCount: data.payload.slides.length,
      payload: JSON.stringify(data.payload),
      requestedById: data.requestedById,
    },
  );
  return findImportJob(row!.Id);
}

export async function findImportJob(id: number) {
  const row = await queryOne<JobRow>(`${JOB_SELECT} ${JOB_FROM} WHERE j.Id = @id`, { id });
  return row && toJson(row);
}

export async function getImportPayload(id: number): Promise<ImportPayload | null> {
  const row = await queryOne<{ Payload: string }>('SELECT Payload FROM WebManualImportJobs WHERE Id = @id', { id });
  return row ? (JSON.parse(row.Payload) as ImportPayload) : null;
}

export async function listImportJobs(requestedById: number | null) {
  const rows = await query<JobRow>(
    `${JOB_SELECT} ${JOB_FROM} ${requestedById !== null ? 'WHERE j.RequestedById = @requestedById' : ''}
     ORDER BY j.CreatedAt DESC, j.Id DESC OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY`,
    requestedById !== null ? { requestedById } : {},
  );
  return rows.map(toJson);
}

export async function countUnseenImports(requestedById: number): Promise<number> {
  const row = await queryOne<{ N: number }>(
    `SELECT COUNT(*) AS N FROM WebManualImportJobs WHERE RequestedById = @requestedById AND Status = N'done' AND SeenAt IS NULL`,
    { requestedById },
  );
  return row?.N ?? 0;
}

export async function markImportSeen(id: number): Promise<void> {
  await execute('UPDATE WebManualImportJobs SET SeenAt = SYSUTCDATETIME() WHERE Id = @id AND SeenAt IS NULL', { id });
}

export async function cancelImportJob(id: number): Promise<boolean> {
  return (
    (await execute(
      `UPDATE WebManualImportJobs SET Status = N'cancelled', UpdatedAt = SYSUTCDATETIME() WHERE Id = @id AND Status IN (N'pending', N'processing')`,
      { id },
    )) > 0
  );
}

// Nhận việc nguyên tử (xem claimNextJob trong quizJobs.ts).
export async function claimNextImportJob(leaseMinutes: number) {
  const row = await queryOne<{ Id: number }>(
    `WITH next AS (
       SELECT TOP 1 * FROM WebManualImportJobs WITH (UPDLOCK, READPAST, ROWLOCK)
       WHERE Status = N'pending'
          OR (Status = N'processing' AND ClaimedAt < DATEADD(MINUTE, -@leaseMinutes, SYSUTCDATETIME()))
       ORDER BY CreatedAt, Id
     )
     UPDATE next SET Status = N'processing', ClaimedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
     OUTPUT INSERTED.Id`,
    { leaseMinutes },
  );
  return row ? findImportJob(row.Id) : null;
}

export async function completeImportJob(id: number, documentId: number): Promise<boolean> {
  return (
    (await execute(
      `UPDATE WebManualImportJobs SET Status = N'done', DocumentId = @documentId, Error = NULL,
              CompletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
       WHERE Id = @id AND Status = N'processing'`,
      { id, documentId },
    )) > 0
  );
}

export async function failImportJob(id: number, error: string): Promise<boolean> {
  return (
    (await execute(
      `UPDATE WebManualImportJobs SET Status = N'failed', Error = @error, CompletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
       WHERE Id = @id AND Status = N'processing'`,
      { id, error: error.slice(0, 1000) },
    )) > 0
  );
}
