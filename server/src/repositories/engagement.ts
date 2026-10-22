// ============================================================
// repositories/engagement.ts — SQL lượt xem 👁 + thả tim ❤ (migration 010)
// ============================================================
// Lượt xem: mỗi người / khách tối đa 1 dòng mỗi bài mỗi ngày (khóa chính chặn trùng).
// Số lượt xem của bài = số dòng. Tim: 1 dòng / người / bài.

import { execute, query, queryOne } from '../db/pool.ts';

const SQL_DUPLICATE_KEY = 2627;
const idsParam = (ids: number[]) => JSON.stringify([...new Set(ids)]);

// Ngày theo giờ MÁY CHỦ (giờ Việt Nam), dạng 'YYYY-MM-DD' — "mỗi ngày" tính theo giờ công ty.
export function localDate(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

// Ghi một lượt xem; đã xem trong ngày rồi thì thôi (không lỗi).
export async function recordView(documentId: number, viewerKey: string): Promise<void> {
  try {
    await execute(
      `IF NOT EXISTS (SELECT 1 FROM WebManualDocViews WHERE DocumentId = @documentId AND ViewDate = @day AND ViewerKey = @viewerKey)
         INSERT INTO WebManualDocViews (DocumentId, ViewDate, ViewerKey) VALUES (@documentId, @day, @viewerKey)`,
      { documentId, day: localDate(), viewerKey },
    );
  } catch (err) {
    // Hai tab mở cùng lúc: dòng đã có -> coi như đã đếm.
    if ((err as { number?: number })?.number !== SQL_DUPLICATE_KEY) throw err;
  }
}

export type DocStats = { views: number; likes: number };

// Tổng lượt xem + tim của nhiều bài (cho thẻ tài liệu ở trang chủ).
export async function statsFor(documentIds: number[]): Promise<Map<number, DocStats>> {
  const map = new Map<number, DocStats>(documentIds.map((id) => [id, { views: 0, likes: 0 }]));
  if (!documentIds.length) return map;
  const ids = idsParam(documentIds);
  const [views, likes] = await Promise.all([
    query<{ DocumentId: number; N: number }>(
      `SELECT DocumentId, COUNT(*) AS N FROM WebManualDocViews
       WHERE DocumentId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids)) GROUP BY DocumentId`,
      { ids },
    ),
    query<{ DocumentId: number; N: number }>(
      `SELECT DocumentId, COUNT(*) AS N FROM WebManualDocLikes
       WHERE DocumentId IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids)) GROUP BY DocumentId`,
      { ids },
    ),
  ]);
  for (const r of views) map.get(r.DocumentId)!.views = r.N;
  for (const r of likes) map.get(r.DocumentId)!.likes = r.N;
  return map;
}

export async function isLiked(userId: number, documentId: number): Promise<boolean> {
  return !!(await queryOne('SELECT 1 AS Found FROM WebManualDocLikes WHERE UserId = @userId AND DocumentId = @documentId', { userId, documentId }));
}

export async function setLike(userId: number, documentId: number, liked: boolean): Promise<void> {
  if (!liked) {
    await execute('DELETE FROM WebManualDocLikes WHERE UserId = @userId AND DocumentId = @documentId', { userId, documentId });
    return;
  }
  try {
    await execute(
      `IF NOT EXISTS (SELECT 1 FROM WebManualDocLikes WHERE UserId = @userId AND DocumentId = @documentId)
         INSERT INTO WebManualDocLikes (DocumentId, UserId) VALUES (@documentId, @userId)`,
      { userId, documentId },
    );
  } catch (err) {
    if ((err as { number?: number })?.number !== SQL_DUPLICATE_KEY) throw err; // bấm 2 lần liền
  }
}

// Bài tôi đã thả tim, mới thả trước.
export async function likedDocIds(userId: number): Promise<number[]> {
  const rows = await query<{ DocumentId: number }>(
    'SELECT DocumentId FROM WebManualDocLikes WHERE UserId = @userId ORDER BY CreatedAt DESC',
    { userId },
  );
  return rows.map((r) => r.DocumentId);
}

// Thống kê cho admin trong khoảng ngày [from, to] (giờ máy chủ).
// Lượt xem / tim TRONG khoảng + tổng tim từ trước tới nay.
export async function engagementReport(from: string, to: string) {
  // Tim lưu giờ UTC -> đổi mốc đầu / cuối khoảng (giờ máy chủ) sang UTC để so.
  const fromUtc = new Date(`${from}T00:00:00`);
  const toUtc = new Date(new Date(`${to}T00:00:00`).getTime() + 24 * 3600_000);
  const rows = await query<{
    Id: number;
    Title: string;
    Slug: string;
    Status: string;
    CategoryName: string | null;
    Views: number;
    Viewers: number;
    Likes: number;
    TotalLikes: number;
  }>(
    `SELECT d.Id, d.Title, d.Slug, d.Status, c.Name AS CategoryName,
            ISNULL(v.Views, 0) AS Views, ISNULL(v.Viewers, 0) AS Viewers,
            ISNULL(l.Likes, 0) AS Likes, ISNULL(t.TotalLikes, 0) AS TotalLikes
     FROM WebManualDocuments d
     LEFT JOIN WebManualCategories c ON c.Id = d.CategoryId
     LEFT JOIN (SELECT DocumentId, COUNT(*) AS Views, COUNT(DISTINCT ViewerKey) AS Viewers
                FROM WebManualDocViews WHERE ViewDate BETWEEN @from AND @to GROUP BY DocumentId) v ON v.DocumentId = d.Id
     LEFT JOIN (SELECT DocumentId, COUNT(*) AS Likes
                FROM WebManualDocLikes WHERE CreatedAt >= @fromUtc AND CreatedAt < @toUtc GROUP BY DocumentId) l ON l.DocumentId = d.Id
     LEFT JOIN (SELECT DocumentId, COUNT(*) AS TotalLikes FROM WebManualDocLikes GROUP BY DocumentId) t ON t.DocumentId = d.Id
     ORDER BY Views DESC, Likes DESC, d.Title`,
    { from, to, fromUtc, toUtc },
  );
  return rows.map((r) => ({
    id: String(r.Id),
    title: r.Title,
    slug: r.Slug,
    status: r.Status,
    category: r.CategoryName,
    views: r.Views,
    viewers: r.Viewers,
    likes: r.Likes,
    totalLikes: r.TotalLikes,
  }));
}
