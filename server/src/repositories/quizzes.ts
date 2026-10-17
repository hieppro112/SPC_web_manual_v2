// ============================================================
// repositories/quizzes.ts — SQL của bài kiểm tra (Quizzes, Assignees, Attempts)
// ============================================================
// Câu hỏi lưu nguyên mảng JSON trong cột Questions (giống Blocks của tài liệu).

import { execute, query, queryOne, withTransaction, type Tx } from '../db/pool.ts';
import type { QuizQuestion, SourceDoc } from '../services/quiz/types.ts';

export type QuizKind = 'practice' | 'exam';
export type QuizStatus = 'draft' | 'published';

type QuizRow = {
  Id: number;
  Title: string;
  Kind: QuizKind;
  Status: QuizStatus;
  Language: string;
  Questions?: string;
  SourceDocs: string;
  PassPercent: number;
  MaxAttempts: number;
  DueAt: Date | null;
  CreatedAt: Date;
  UpdatedAt: Date;
  QuestionCount: number;
  CreatedByName: string | null;
};

const QUIZ_SELECT = `
  SELECT q.Id, q.Title, q.Kind, q.Status, q.Language, q.SourceDocs, q.PassPercent, q.MaxAttempts, q.DueAt,
         q.CreatedAt, q.UpdatedAt, u.DisplayName AS CreatedByName,
         (SELECT COUNT(*) FROM OPENJSON(q.Questions)) AS QuestionCount`;
const QUIZ_FROM = `
  FROM WebManualQuizzes q
  LEFT JOIN WebManualUsers u ON u.Id = q.CreatedById`;

function toJson(row: QuizRow) {
  return {
    id: String(row.Id),
    title: row.Title,
    kind: row.Kind,
    status: row.Status,
    language: row.Language,
    sourceDocs: JSON.parse(row.SourceDocs) as SourceDoc[],
    passPercent: row.PassPercent,
    maxAttempts: row.MaxAttempts,
    dueAt: row.DueAt,
    questionCount: row.QuestionCount,
    createdBy: row.CreatedByName,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    ...(row.Questions !== undefined ? { questions: JSON.parse(row.Questions) as QuizQuestion[] } : {}),
  };
}

export type QuizSummary = ReturnType<typeof toJson>;

// ---------- Đọc ----------

// Editor / admin: mọi bộ đề, kèm số người được giao + số lượt nộp.
export async function listAllQuizzes() {
  const rows = await query<QuizRow & { AssigneeCount: number; AttemptCount: number }>(
    `${QUIZ_SELECT},
       (SELECT COUNT(*) FROM WebManualQuizAssignees a WHERE a.QuizId = q.Id) AS AssigneeCount,
       (SELECT COUNT(*) FROM WebManualQuizAttempts t WHERE t.QuizId = q.Id) AS AttemptCount
     ${QUIZ_FROM}
     ORDER BY q.UpdatedAt DESC, q.Id DESC`,
  );
  return rows.map((r) => ({ ...toJson(r), assigneeCount: r.AssigneeCount, attemptCount: r.AttemptCount }));
}

// Người làm bài: bộ đề đã xuất bản mà người này được làm
//   Ôn tập: ai đăng nhập cũng làm được
//   Kiểm tra: không giao cho ai = mọi người; có giao = chỉ người được giao
// kèm kết quả của CHÍNH người này (số lần đã làm, lần gần nhất).
export async function listQuizzesForUser(userId: number) {
  const rows = await query<
    QuizRow & { Assigned: number; MyAttempts: number; MyPercentage: number | null; MyPassed: boolean | null; MySubmittedAt: Date | null }
  >(
    `${QUIZ_SELECT},
       CASE WHEN EXISTS (SELECT 1 FROM WebManualQuizAssignees a WHERE a.QuizId = q.Id AND a.UserId = @userId) THEN 1 ELSE 0 END AS Assigned,
       (SELECT COUNT(*) FROM WebManualQuizAttempts t WHERE t.QuizId = q.Id AND t.UserId = @userId) AS MyAttempts,
       last.Percentage AS MyPercentage, last.Passed AS MyPassed, last.SubmittedAt AS MySubmittedAt
     ${QUIZ_FROM}
     OUTER APPLY (SELECT TOP 1 t.Percentage, t.Passed, t.SubmittedAt FROM WebManualQuizAttempts t
                  WHERE t.QuizId = q.Id AND t.UserId = @userId ORDER BY t.SubmittedAt DESC, t.Id DESC) last
     WHERE q.Status = N'published'
       AND (q.Kind = N'practice'
            OR NOT EXISTS (SELECT 1 FROM WebManualQuizAssignees a WHERE a.QuizId = q.Id)
            OR EXISTS (SELECT 1 FROM WebManualQuizAssignees a WHERE a.QuizId = q.Id AND a.UserId = @userId))
     ORDER BY q.UpdatedAt DESC, q.Id DESC`,
    { userId },
  );
  return rows.map((r) => ({
    ...toJson(r),
    assigned: r.Assigned === 1,
    my: { attempts: r.MyAttempts, percentage: r.MyPercentage, passed: r.MyPassed, submittedAt: r.MySubmittedAt },
  }));
}

export async function findQuiz(id: number) {
  const row = await queryOne<QuizRow>(`${QUIZ_SELECT}, q.Questions ${QUIZ_FROM} WHERE q.Id = @id`, { id });
  if (!row) return null;
  const assignees = await query<{ UserId: number }>('SELECT UserId FROM WebManualQuizAssignees WHERE QuizId = @id', { id });
  return { ...toJson(row), questions: JSON.parse(row.Questions!) as QuizQuestion[], assigneeIds: assignees.map((a) => String(a.UserId)) };
}

export type FullQuiz = NonNullable<Awaited<ReturnType<typeof findQuiz>>>;

export async function hasAssignees(quizId: number): Promise<boolean> {
  return !!(await queryOne('SELECT TOP 1 1 AS Found FROM WebManualQuizAssignees WHERE QuizId = @quizId', { quizId }));
}

export async function isAssigned(quizId: number, userId: number): Promise<boolean> {
  return !!(await queryOne('SELECT 1 AS Found FROM WebManualQuizAssignees WHERE QuizId = @quizId AND UserId = @userId', { quizId, userId }));
}

// Người có thể được giao bài: tài khoản đang hoạt động (không gửi email ra ngoài).
export async function listAssignableUsers() {
  const rows = await query<{ Id: number; Username: string; DisplayName: string; Role: string }>(
    `SELECT Id, Username, DisplayName, Role FROM WebManualUsers WHERE Status = N'active' ORDER BY DisplayName, Username`,
  );
  return rows.map((r) => ({ id: String(r.Id), username: r.Username, displayName: r.DisplayName, role: r.Role }));
}

// ---------- Ghi ----------

export type QuizRecord = {
  title: string;
  kind: QuizKind;
  status: QuizStatus;
  language: string;
  questions: QuizQuestion[];
  sourceDocs: SourceDoc[];
  passPercent: number;
  maxAttempts: number;
  dueAt: Date | null;
  assigneeIds: number[];
};

async function replaceAssignees(quizId: number, userIds: number[], tx: Tx) {
  await execute('DELETE FROM WebManualQuizAssignees WHERE QuizId = @quizId', { quizId }, tx);
  for (const userId of new Set(userIds)) {
    await execute('INSERT INTO WebManualQuizAssignees (QuizId, UserId) VALUES (@quizId, @userId)', { quizId, userId }, tx);
  }
}

// userId null: đề do Claude tạo cho yêu cầu mà người gửi đã bị xóa tài khoản.
const params = (data: QuizRecord, userId: number | null) => ({
  title: data.title,
  kind: data.kind,
  status: data.status,
  language: data.language,
  questions: JSON.stringify(data.questions),
  sourceDocs: JSON.stringify(data.sourceDocs),
  passPercent: data.passPercent,
  maxAttempts: data.maxAttempts,
  dueAt: data.dueAt,
  userId,
});

export async function createQuiz(data: QuizRecord, userId: number | null): Promise<number> {
  return withTransaction(async (tx) => {
    const row = await queryOne<{ Id: number }>(
      `INSERT INTO WebManualQuizzes (Title, Kind, Status, Language, Questions, SourceDocs, PassPercent, MaxAttempts, DueAt, CreatedById, UpdatedById)
       OUTPUT INSERTED.Id
       VALUES (@title, @kind, @status, @language, @questions, @sourceDocs, @passPercent, @maxAttempts, @dueAt, @userId, @userId)`,
      params(data, userId),
      tx,
    );
    await replaceAssignees(row!.Id, data.assigneeIds, tx);
    return row!.Id;
  });
}

export async function updateQuiz(id: number, data: QuizRecord, userId: number): Promise<void> {
  await withTransaction(async (tx) => {
    await execute(
      `UPDATE WebManualQuizzes
       SET Title = @title, Kind = @kind, Status = @status, Language = @language, Questions = @questions,
           SourceDocs = @sourceDocs, PassPercent = @passPercent, MaxAttempts = @maxAttempts, DueAt = @dueAt,
           UpdatedById = @userId, UpdatedAt = SYSUTCDATETIME()
       WHERE Id = @id`,
      { ...params(data, userId), id },
      tx,
    );
    await replaceAssignees(id, data.assigneeIds, tx);
  });
}

// Xóa bộ đề -> giao bài + bài làm tự xóa theo (ON DELETE CASCADE).
export async function deleteQuiz(id: number): Promise<boolean> {
  return (await execute('DELETE FROM WebManualQuizzes WHERE Id = @id', { id })) > 0;
}

// ---------- Bài làm ----------

export async function countAttempts(quizId: number, userId: number): Promise<number> {
  const row = await queryOne<{ N: number }>('SELECT COUNT(*) AS N FROM WebManualQuizAttempts WHERE QuizId = @quizId AND UserId = @userId', {
    quizId,
    userId,
  });
  return row?.N ?? 0;
}

export async function insertAttempt(data: {
  quizId: number;
  userId: number;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  answers: Record<string, string[]>;
}) {
  await execute(
    `INSERT INTO WebManualQuizAttempts (QuizId, UserId, Score, Total, Percentage, Passed, Answers)
     VALUES (@quizId, @userId, @score, @total, @percentage, @passed, @answers)`,
    { ...data, answers: JSON.stringify(data.answers) },
  );
}

// Bảng điểm của một bộ đề cho admin: mỗi người MỘT dòng = lần làm GẦN NHẤT,
// kèm số lần đã làm. Người được giao mà chưa làm cũng có dòng (điểm trống).
export async function listResults(quizId: number) {
  const rows = await query<{
    UserId: number;
    Username: string;
    DisplayName: string;
    Assigned: number;
    Attempts: number;
    Score: number | null;
    Total: number | null;
    Percentage: number | null;
    Passed: boolean | null;
    SubmittedAt: Date | null;
  }>(
    `WITH people AS (
       SELECT UserId FROM WebManualQuizAssignees WHERE QuizId = @quizId
       UNION
       SELECT UserId FROM WebManualQuizAttempts WHERE QuizId = @quizId
     ),
     ranked AS (
       SELECT t.*, ROW_NUMBER() OVER (PARTITION BY t.UserId ORDER BY t.SubmittedAt DESC, t.Id DESC) AS Rn,
              COUNT(*) OVER (PARTITION BY t.UserId) AS Cnt
       FROM WebManualQuizAttempts t WHERE t.QuizId = @quizId
     )
     SELECT u.Id AS UserId, u.Username, u.DisplayName,
            CASE WHEN EXISTS (SELECT 1 FROM WebManualQuizAssignees a WHERE a.QuizId = @quizId AND a.UserId = u.Id) THEN 1 ELSE 0 END AS Assigned,
            ISNULL(r.Cnt, 0) AS Attempts, r.Score, r.Total, r.Percentage, r.Passed, r.SubmittedAt
     FROM people p
     JOIN WebManualUsers u ON u.Id = p.UserId
     LEFT JOIN ranked r ON r.UserId = p.UserId AND r.Rn = 1
     ORDER BY u.DisplayName, u.Username`,
    { quizId },
  );
  return rows.map((r) => ({
    userId: String(r.UserId),
    username: r.Username,
    displayName: r.DisplayName,
    assigned: r.Assigned === 1,
    attempts: r.Attempts,
    score: r.Score,
    total: r.Total,
    percentage: r.Percentage,
    passed: r.Passed,
    submittedAt: r.SubmittedAt,
  }));
}

// Kết quả chỉ giữ N ngày (dữ liệu đánh giá cá nhân) — server gọi định kỳ.
export async function deleteOldAttempts(days: number): Promise<number> {
  return execute('DELETE FROM WebManualQuizAttempts WHERE SubmittedAt < DATEADD(DAY, -@days, SYSUTCDATETIME())', { days });
}
