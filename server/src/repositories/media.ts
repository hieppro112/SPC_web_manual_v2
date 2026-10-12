// ============================================================
// repositories/media.ts — SQL của Media + UploadSessions
// ============================================================

import { execute, query, queryOne } from '../db/pool.ts';

export const MEDIA_KINDS = ['image', 'video', 'file'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

type MediaRow = {
  Id: number;
  Kind: MediaKind;
  Url: string;
  OriginalName: string;
  Mime: string;
  Size: number | string; // BIGINT: thư viện mssql có thể trả về chuỗi
  Width: number | null;
  Height: number | null;
  CreatedAt: Date;
};

const MEDIA_COLUMNS = 'Id, Kind, Url, OriginalName, Mime, Size, Width, Height, CreatedAt';

function toJson(row: MediaRow) {
  return {
    id: String(row.Id),
    kind: row.Kind,
    url: row.Url,
    originalName: row.OriginalName,
    mime: row.Mime,
    size: Number(row.Size),
    width: row.Width ?? undefined,
    height: row.Height ?? undefined,
    createdAt: row.CreatedAt,
  };
}

export type MediaJson = ReturnType<typeof toJson>;

export async function createMedia(data: {
  kind: MediaKind;
  url: string;
  originalName: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  uploadedById: number | null;
}): Promise<MediaJson & { rawId: number }> {
  const row = await queryOne<MediaRow>(
    `INSERT INTO WebManualMedia (Kind, Url, OriginalName, Mime, Size, Width, Height, UploadedById)
     OUTPUT ${MEDIA_COLUMNS.split(', ').map((c) => `INSERTED.${c}`).join(', ')}
     VALUES (@kind, @url, @originalName, @mime, @size, @width, @height, @uploadedById)`,
    data,
  );
  return { ...toJson(row!), rawId: row!.Id };
}

export async function listMedia(kind?: MediaKind) {
  const rows = await query<MediaRow>(
    `SELECT TOP 200 ${MEDIA_COLUMNS} FROM WebManualMedia ${kind ? 'WHERE Kind = @kind' : ''} ORDER BY CreatedAt DESC, Id DESC`,
    kind ? { kind } : {},
  );
  return rows.map(toJson);
}

// ---------- Phiên upload QR ----------

type SessionRow = {
  Id: number;
  Token: string;
  Kind: 'image' | 'video';
  Status: 'pending' | 'done';
  CreatedById: number;
  ExpiresAt: Date;
  MediaId: number | null;
};

export async function createUploadSession(token: string, kind: 'image' | 'video', userId: number, expiresAt: Date) {
  await execute(
    'INSERT INTO WebManualUploadSessions (Token, Kind, CreatedById, ExpiresAt) VALUES (@token, @kind, @userId, @expiresAt)',
    { token, kind, userId, expiresAt },
  );
  return { token, kind, expiresAt };
}

// Phiên CÒN HẠN theo token, kèm thông tin file nếu điện thoại đã gửi.
export async function findActiveSession(token: string) {
  const row = await queryOne<SessionRow>(
    `SELECT Id, Token, Kind, Status, CreatedById, ExpiresAt, MediaId
     FROM WebManualUploadSessions WHERE Token = @token AND ExpiresAt > SYSUTCDATETIME()`,
    { token },
  );
  if (!row) return null;
  const media = row.MediaId
    ? await queryOne<MediaRow>(`SELECT ${MEDIA_COLUMNS} FROM WebManualMedia WHERE Id = @id`, { id: row.MediaId })
    : null;
  return {
    id: row.Id,
    kind: row.Kind,
    status: row.Status,
    createdById: row.CreatedById,
    expiresAt: row.ExpiresAt,
    media: media ? toJson(media) : null,
  };
}

// "Giành" phiên một cách NGUYÊN TỬ: chỉ cập nhật nếu vẫn còn 'pending'.
// Hai điện thoại gửi cùng lúc thì chỉ MỘT câu UPDATE ảnh hưởng được 1 dòng.
export async function claimSession(sessionId: number, mediaId: number): Promise<boolean> {
  const affected = await execute(
    `UPDATE WebManualUploadSessions SET Status = N'done', MediaId = @mediaId WHERE Id = @sessionId AND Status = N'pending'`,
    { sessionId, mediaId },
  );
  return affected === 1;
}

// MongoDB có TTL index tự xóa; SQL Server không có -> server gọi hàm này
// định kỳ (xem index.ts). Code luôn tự kiểm tra hạn nên chậm xóa không sao.
export async function deleteExpiredSessions(): Promise<number> {
  return execute('DELETE FROM WebManualUploadSessions WHERE ExpiresAt < SYSUTCDATETIME()');
}
