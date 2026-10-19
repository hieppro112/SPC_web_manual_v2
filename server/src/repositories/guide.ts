// ============================================================
// repositories/guide.ts — SQL của "Hướng dẫn sử dụng"
// ============================================================
// Bảng WebManualGuideProgress: (UserId, TaskKey) = người này đã làm xong
// nhiệm vụ này. Bài hướng dẫn là tài liệu bình thường, nhận ra nhờ slug
// "guide-<ngôn ngữ>-..." (đổi tên / chuyển thể loại vẫn nhận ra).

import { HttpError } from '../middleware/errorHandler.ts';
import { escapeLike, execute, query, queryOne } from '../db/pool.ts';

const SQL_MISSING_TABLE = 208; // Invalid object name
const SQL_DUPLICATE_KEY = 2627;

const sqlNumber = (err: unknown) => (err as { number?: unknown })?.number;

// Chưa chạy server/sql/006 -> báo rõ thay vì lỗi 500 khó hiểu.
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (sqlNumber(err) === SQL_MISSING_TABLE) {
      throw new HttpError(503, 'Chưa tạo bảng tiến độ hướng dẫn — admin chạy server/sql/006_guide_progress.sql');
    }
    throw err;
  }
}

// ---------- Tiến độ ----------

export async function listDoneTasks(userId: number) {
  return guarded(async () => {
    const rows = await query<{ TaskKey: string; CompletedAt: Date }>(
      'SELECT TaskKey, CompletedAt FROM WebManualGuideProgress WHERE UserId = @userId',
      { userId },
    );
    return Object.fromEntries(rows.map((r) => [r.TaskKey, r.CompletedAt.toISOString()]));
  });
}

// Đánh dấu xong; trả về true nếu LẦN ĐẦU xong (để client chúc mừng đúng một lần).
export async function markTaskDone(userId: number, taskKey: string): Promise<boolean> {
  return guarded(async () => {
    try {
      const added = await execute(
        `IF NOT EXISTS (SELECT 1 FROM WebManualGuideProgress WHERE UserId = @userId AND TaskKey = @taskKey)
           INSERT INTO WebManualGuideProgress (UserId, TaskKey) VALUES (@userId, @taskKey)`,
        { userId, taskKey },
      );
      return added > 0;
    } catch (err) {
      // Hai tab cùng báo một lúc: dòng đã có -> coi như đã xong từ trước.
      if (sqlNumber(err) === SQL_DUPLICATE_KEY) return false;
      throw err;
    }
  });
}

export async function resetProgress(userId: number): Promise<void> {
  await guarded(() => execute('DELETE FROM WebManualGuideProgress WHERE UserId = @userId', { userId }));
}

// Bảng tiến độ cho admin: mọi tài khoản đang hoạt động + các nhiệm vụ đã xong.
export async function progressReport() {
  return guarded(async () => {
    const rows = await query<{
      Id: number;
      Username: string;
      DisplayName: string;
      Role: 'admin' | 'editor' | 'user';
      TaskKey: string | null;
      CompletedAt: Date | null;
    }>(
      `SELECT u.Id, u.Username, u.DisplayName, u.Role, p.TaskKey, p.CompletedAt
       FROM WebManualUsers u
       LEFT JOIN WebManualGuideProgress p ON p.UserId = u.Id
       WHERE u.Status = N'active'
       ORDER BY u.DisplayName, u.Username`,
    );
    // Nhiều dòng (mỗi nhiệm vụ một dòng) -> gom lại mỗi người một mục.
    const users = new Map<number, { id: string; username: string; displayName: string; role: (typeof rows)[number]['Role']; done: string[]; lastAt: Date | null }>();
    for (const r of rows) {
      let u = users.get(r.Id);
      if (!u) {
        u = { id: String(r.Id), username: r.Username, displayName: r.DisplayName, role: r.Role, done: [], lastAt: null };
        users.set(r.Id, u);
      }
      if (r.TaskKey) u.done.push(r.TaskKey);
      if (r.CompletedAt && (!u.lastAt || r.CompletedAt > u.lastAt)) u.lastAt = r.CompletedAt;
    }
    return [...users.values()];
  });
}

// ---------- Bài hướng dẫn + dữ liệu mẫu ----------

// Bài hướng dẫn đã xuất bản của một ngôn ngữ, đúng thứ tự (slug có số 01, 02...).
export async function listGuideDocs(lang: string) {
  const rows = await query<{ Id: number; Title: string; Slug: string; Description: string }>(
    `SELECT Id, Title, Slug, Description FROM WebManualDocuments
     WHERE Status = N'published' AND Slug LIKE @prefix
     ORDER BY Slug`,
    { prefix: `${escapeLike(`guide-${lang}-`)}%` },
  );
  return rows.map((r) => ({ id: String(r.Id), title: r.Title, slug: r.Slug, desc: r.Description }));
}

export async function findCategoryIdByName(name: string, parentId: number | null): Promise<number | null> {
  const row = await queryOne<{ Id: number }>(
    `SELECT TOP 1 Id FROM WebManualCategories
     WHERE Name = @name AND ((@parentId IS NULL AND ParentId IS NULL) OR ParentId = @parentId)
     ORDER BY Id`,
    { name, parentId },
  );
  return row?.Id ?? null;
}

export async function findQuizIdByTitle(title: string): Promise<number | null> {
  const row = await queryOne<{ Id: number }>('SELECT TOP 1 Id FROM WebManualQuizzes WHERE Title = @title ORDER BY Id', { title });
  return row?.Id ?? null;
}
