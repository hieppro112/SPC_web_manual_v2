// ============================================================
// repositories/quizJobs.ts — SQL của hàng đợi "nhờ Claude tạo đề"
// ============================================================

import { execute, query, queryOne } from '../db/pool.ts';
import type { SourceDoc } from '../services/quiz/types.ts';

export type QuizJobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'expired' | 'cancelled';

type JobRow = {
  Id: number;
  SourceDocs: string;
  Language: string;
  QuestionCount: number;
  Status: QuizJobStatus;
  RequestedById: number | null;
  RequestedByName: string | null;
  QuizId: number | null;
  Error: string | null;
  ClaimedAt: Date | null;
  CompletedAt: Date | null;
  SeenAt: Date | null;
  CreatedAt: Date;
};

const JOB_SELECT = `
  SELECT j.Id, j.SourceDocs, j.Language, j.QuestionCount, j.Status, j.RequestedById, u.DisplayName AS RequestedByName,
         j.QuizId, j.Error, j.ClaimedAt, j.CompletedAt, j.SeenAt, j.CreatedAt
  FROM WebManualQuizJobs j
  LEFT JOIN WebManualUsers u ON u.Id = j.RequestedById`;

function toJson(row: JobRow) {
  return {
    id: String(row.Id),
    sourceDocs: JSON.parse(row.SourceDocs) as SourceDoc[],
    language: row.Language,
    questionCount: row.QuestionCount,
    status: row.Status,
    requestedById: row.RequestedById !== null ? String(row.RequestedById) : null,
    requestedBy: row.RequestedByName,
    quizId: row.QuizId !== null ? String(row.QuizId) : null,
    error: row.Error,
    claimedAt: row.ClaimedAt,
    completedAt: row.CompletedAt,
    seenAt: row.SeenAt,
    createdAt: row.CreatedAt,
  };
}

export type QuizJob = ReturnType<typeof toJson>;

// Yêu cầu chờ quá lâu (máy chạy Claude tắt nhiều ngày...) -> "quá hạn",
// worker không nhận nữa, editor được gợi ý dùng AI nội bộ thay thế.
export async function expireOldJobs(hours: number): Promise<number> {
  return execute(
    `UPDATE WebManualQuizJobs SET Status = N'expired', UpdatedAt = SYSUTCDATETIME()
     WHERE Status IN (N'pending', N'processing') AND CreatedAt < DATEADD(HOUR, -@hours, SYSUTCDATETIME())`,
    { hours },
  );
}

export async function createJob(data: { sourceDocs: SourceDoc[]; language: string; questionCount: number; requestedById: number }) {
  const row = await queryOne<{ Id: number }>(
    `INSERT INTO WebManualQuizJobs (SourceDocs, Language, QuestionCount, RequestedById)
     OUTPUT INSERTED.Id VALUES (@sourceDocs, @language, @questionCount, @requestedById)`,
    { ...data, sourceDocs: JSON.stringify(data.sourceDocs) },
  );
  return findJob(row!.Id);
}

export async function findJob(id: number) {
  const row = await queryOne<JobRow>(`${JOB_SELECT} WHERE j.Id = @id`, { id });
  return row && toJson(row);
}

// Editor: yêu cầu của mình; admin: của mọi người. 50 yêu cầu mới nhất.
export async function listJobs(requestedById: number | null) {
  const rows = await query<JobRow>(
    `${JOB_SELECT} ${requestedById !== null ? 'WHERE j.RequestedById = @requestedById' : ''}
     ORDER BY j.CreatedAt DESC, j.Id DESC OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY`,
    requestedById !== null ? { requestedById } : {},
  );
  return rows.map(toJson);
}

export async function countJobsToday(requestedById: number): Promise<number> {
  const row = await queryOne<{ N: number }>(
    `SELECT COUNT(*) AS N FROM WebManualQuizJobs
     WHERE RequestedById = @requestedById AND CreatedAt >= CAST(SYSUTCDATETIME() AS DATE)`,
    { requestedById },
  );
  return row?.N ?? 0;
}

// Số đề Claude đã tạo xong mà người yêu cầu CHƯA mở -> chấm đỏ trên thanh trên cùng.
export async function countUnseenDone(requestedById: number): Promise<number> {
  const row = await queryOne<{ N: number }>(
    `SELECT COUNT(*) AS N FROM WebManualQuizJobs WHERE RequestedById = @requestedById AND Status = N'done' AND SeenAt IS NULL`,
    { requestedById },
  );
  return row?.N ?? 0;
}

export async function markSeen(id: number): Promise<void> {
  await execute('UPDATE WebManualQuizJobs SET SeenAt = SYSUTCDATETIME() WHERE Id = @id AND SeenAt IS NULL', { id });
}

export async function cancelJob(id: number): Promise<boolean> {
  const n = await execute(
    `UPDATE WebManualQuizJobs SET Status = N'cancelled', UpdatedAt = SYSUTCDATETIME()
     WHERE Id = @id AND Status IN (N'pending', N'processing')`,
    { id },
  );
  return n > 0;
}

// ---------- Worker ----------

// "Nhận việc" NGUYÊN TỬ: lấy yêu cầu chờ lâu nhất và chuyển sang 'processing'
// trong CÙNG một câu lệnh. UPDLOCK + READPAST: hai worker chạy cùng lúc
// không bao giờ nhận trùng một việc. Việc đã nhận quá `leaseMinutes` mà chưa
// xong (worker bị tắt giữa chừng) được nhận lại.
export async function claimNextJob(leaseMinutes: number) {
  const row = await queryOne<{ Id: number }>(
    `WITH next AS (
       SELECT TOP 1 * FROM WebManualQuizJobs WITH (UPDLOCK, READPAST, ROWLOCK)
       WHERE Status = N'pending'
          OR (Status = N'processing' AND ClaimedAt < DATEADD(MINUTE, -@leaseMinutes, SYSUTCDATETIME()))
       ORDER BY CreatedAt, Id
     )
     UPDATE next SET Status = N'processing', ClaimedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
     OUTPUT INSERTED.Id`,
    { leaseMinutes },
  );
  return row ? findJob(row.Id) : null;
}

// Chỉ hoàn tất / báo lỗi việc ĐANG xử lý (editor đã hủy thì bỏ qua kết quả).
export async function completeJob(id: number, quizId: number): Promise<boolean> {
  const n = await execute(
    `UPDATE WebManualQuizJobs SET Status = N'done', QuizId = @quizId, Error = NULL,
            CompletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
     WHERE Id = @id AND Status = N'processing'`,
    { id, quizId },
  );
  return n > 0;
}

export async function failJob(id: number, error: string): Promise<boolean> {
  const n = await execute(
    `UPDATE WebManualQuizJobs SET Status = N'failed', Error = @error, CompletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
     WHERE Id = @id AND Status = N'processing'`,
    { id, error: error.slice(0, 1000) },
  );
  return n > 0;
}
