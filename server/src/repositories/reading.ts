// ============================================================
// repositories/reading.ts — SQL của "thời gian đọc tối thiểu" (migration 008)
// ============================================================
//   WebManualReadingRules    — bài nào bắt buộc đọc bao nhiêu giây
//   WebManualReadingProgress — mỗi người đã đọc mỗi bài (theo phiên bản) bao lâu

import { execute, query, queryOne } from '../db/pool.ts';

// Danh sách id -> MỘT tham số chuỗi JSON (OPENJSON), không ghép số vào câu SQL.
const idsParam = (ids: number[]) => JSON.stringify([...new Set(ids)]);

// ---------- Quy định ----------

export async function getRule(documentId: number): Promise<number | null> {
  const row = await queryOne<{ RequiredSeconds: number }>('SELECT RequiredSeconds FROM WebManualReadingRules WHERE DocumentId = @documentId', {
    documentId,
  });
  return row?.RequiredSeconds ?? null;
}

export async function getRules(documentIds: number[]): Promise<Map<number, number>> {
  if (!documentIds.length) return new Map();
  const rows = await query<{ DocumentId: number; RequiredSeconds: number }>(
    'SELECT DocumentId, RequiredSeconds FROM WebManualReadingRules WHERE DocumentId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))',
    { ids: idsParam(documentIds) },
  );
  return new Map(rows.map((r) => [r.DocumentId, r.RequiredSeconds]));
}

// seconds null / 0 = bỏ bắt buộc.
export async function setRule(documentId: number, seconds: number | null, userId: number): Promise<void> {
  if (!seconds) {
    await execute('DELETE FROM WebManualReadingRules WHERE DocumentId = @documentId', { documentId });
    return;
  }
  await execute(
    `MERGE WebManualReadingRules WITH (HOLDLOCK) AS dst
     USING (SELECT @documentId AS DocumentId) AS src ON dst.DocumentId = src.DocumentId
     WHEN MATCHED THEN UPDATE SET RequiredSeconds = @seconds, UpdatedById = @userId, UpdatedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (DocumentId, RequiredSeconds, UpdatedById) VALUES (@documentId, @seconds, @userId);`,
    { documentId, seconds, userId },
  );
}

// Bài có quy định thời gian đọc (cho ô chọn ở trang báo cáo).
export async function listRuledDocuments() {
  const rows = await query<{ Id: number; Title: string; Slug: string; Version: number; RequiredSeconds: number }>(
    `SELECT d.Id, d.Title, d.Slug, d.Version, r.RequiredSeconds
     FROM WebManualReadingRules r JOIN WebManualDocuments d ON d.Id = r.DocumentId
     ORDER BY d.Title`,
  );
  return rows.map((r) => ({ id: String(r.Id), title: r.Title, slug: r.Slug, version: r.Version, requiredSeconds: r.RequiredSeconds }));
}

// ---------- Tiến độ ----------

type ProgressRow = { Seconds: number; RequiredSeconds: number; ReachedEnd: boolean; CompletedAt: Date | null };
const progressJson = (r: ProgressRow) => ({
  seconds: r.Seconds,
  requiredSeconds: r.RequiredSeconds,
  reachedEnd: !!r.ReachedEnd,
  completedAt: r.CompletedAt,
});
export type Progress = ReturnType<typeof progressJson>;

export async function getProgress(userId: number, documentId: number, version: number): Promise<Progress | null> {
  const row = await queryOne<ProgressRow>(
    `SELECT Seconds, RequiredSeconds, ReachedEnd, CompletedAt FROM WebManualReadingProgress
     WHERE UserId = @userId AND DocumentId = @documentId AND Version = @version`,
    { userId, documentId, version },
  );
  return row && progressJson(row);
}

// Một "nhịp" từ trình duyệt: cộng thêm `delta` giây đọc. Server KHÔNG tin hẳn trình
// duyệt: chỉ cộng tối đa bằng thời gian thật đã trôi qua từ nhịp trước (+5 giây
// cho độ trễ mạng) -> sửa code trình duyệt cũng không "tua nhanh" được.
// Đủ giây + đã cuộn tới cuối -> ghi CompletedAt (một lần).
export async function recordBeat(
  userId: number,
  documentId: number,
  version: number,
  requiredSeconds: number,
  delta: number,
  reachedEnd: boolean,
): Promise<Progress> {
  const row = await queryOne<ProgressRow>(
    `MERGE WebManualReadingProgress WITH (HOLDLOCK) AS dst
     USING (SELECT @userId AS UserId, @documentId AS DocumentId, @version AS Version) AS src
       ON dst.UserId = src.UserId AND dst.DocumentId = src.DocumentId AND dst.Version = src.Version
     WHEN MATCHED THEN UPDATE SET
       Seconds = dst.Seconds + CASE
         WHEN @delta < DATEDIFF(SECOND, dst.LastBeatAt, SYSUTCDATETIME()) + 5 THEN @delta
         ELSE DATEDIFF(SECOND, dst.LastBeatAt, SYSUTCDATETIME()) + 5 END,
       RequiredSeconds = @requiredSeconds,
       ReachedEnd = CASE WHEN @reachedEnd = 1 THEN 1 ELSE dst.ReachedEnd END,
       LastBeatAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (UserId, DocumentId, Version, Seconds, RequiredSeconds, ReachedEnd)
       VALUES (@userId, @documentId, @version, 0, @requiredSeconds, @reachedEnd)
     OUTPUT INSERTED.Seconds, INSERTED.RequiredSeconds, INSERTED.ReachedEnd, INSERTED.CompletedAt;`,
    { userId, documentId, version, requiredSeconds, delta, reachedEnd: reachedEnd ? 1 : 0 },
  );
  let progress = progressJson(row!);
  if (!progress.completedAt && progress.reachedEnd && progress.seconds >= progress.requiredSeconds) {
    await execute(
      `UPDATE WebManualReadingProgress SET CompletedAt = SYSUTCDATETIME()
       WHERE UserId = @userId AND DocumentId = @documentId AND Version = @version AND CompletedAt IS NULL`,
      { userId, documentId, version },
    );
    progress = { ...progress, completedAt: new Date() };
  }
  return progress;
}

// Trong các bài này, người này đã đọc xong bài nào (tính theo phiên bản HIỆN TẠI của bài).
export async function completedDocIds(userId: number, documentIds: number[]): Promise<Set<number>> {
  if (!documentIds.length) return new Set();
  const rows = await query<{ DocumentId: number }>(
    `SELECT p.DocumentId FROM WebManualReadingProgress p
     JOIN WebManualDocuments d ON d.Id = p.DocumentId AND d.Version = p.Version
     WHERE p.UserId = @userId AND p.CompletedAt IS NOT NULL
       AND p.DocumentId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`,
    { userId, ids: idsParam(documentIds) },
  );
  return new Set(rows.map((r) => r.DocumentId));
}

// Báo cáo một bài: MỌI tài khoản quyền "Người dùng" đang hoạt động + tiến độ ở phiên bản hiện tại.
export async function readingReport(documentId: number) {
  const rows = await query<{
    Id: number;
    Username: string;
    DisplayName: string;
    Seconds: number | null;
    ReachedEnd: boolean | null;
    CompletedAt: Date | null;
    StartedAt: Date | null;
    LastBeatAt: Date | null;
  }>(
    `SELECT u.Id, u.Username, u.DisplayName, p.Seconds, p.ReachedEnd, p.CompletedAt, p.StartedAt, p.LastBeatAt
     FROM WebManualUsers u
     CROSS JOIN (SELECT Version FROM WebManualDocuments WHERE Id = @documentId) d
     LEFT JOIN WebManualReadingProgress p ON p.UserId = u.Id AND p.DocumentId = @documentId AND p.Version = d.Version
     WHERE u.Status = N'active' AND u.Role = N'user'
     ORDER BY CASE WHEN p.CompletedAt IS NULL THEN 1 ELSE 0 END, u.DisplayName, u.Username`,
    { documentId },
  );
  return rows.map((r) => ({
    userId: String(r.Id),
    username: r.Username,
    displayName: r.DisplayName,
    seconds: r.Seconds ?? 0,
    reachedEnd: !!r.ReachedEnd,
    completedAt: r.CompletedAt,
    startedAt: r.StartedAt,
    lastReadAt: r.LastBeatAt,
  }));
}
