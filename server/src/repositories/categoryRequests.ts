// ============================================================
// repositories/categoryRequests.ts — Biên tập đề xuất thể loại mới, admin duyệt (migration 011)
// ============================================================
// Vòng đời: pending (chờ duyệt) -> approved (đã tạo thể loại, CategoryId = thể loại đó)
//                               -> rejected (kèm lý do, có thể để trống)
// Người đề xuất tự hủy đề xuất đang chờ = xóa dòng.

import { execute, query, queryOne, type Tx } from '../db/pool.ts';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

type Row = {
  Id: number;
  ParentId: number;
  Name: string;
  IconName: string;
  Note: string;
  Status: RequestStatus;
  RejectReason: string | null;
  CategoryId: number | null;
  RequestedById: number;
  RequestedByName: string | null;
  ReviewedByName: string | null;
  ReviewedAt: Date | null;
  CreatedAt: Date;
};

const SELECT = `
  SELECT r.Id, r.ParentId, r.Name, r.IconName, r.Note, r.Status, r.RejectReason, r.CategoryId,
         r.RequestedById, u.DisplayName AS RequestedByName, a.DisplayName AS ReviewedByName, r.ReviewedAt, r.CreatedAt
  FROM WebManualCategoryRequests r
  LEFT JOIN WebManualUsers u ON u.Id = r.RequestedById
  LEFT JOIN WebManualUsers a ON a.Id = r.ReviewedById`;

const toJson = (r: Row) => ({
  id: String(r.Id),
  parentId: String(r.ParentId),
  name: r.Name,
  iconName: r.IconName,
  note: r.Note,
  status: r.Status,
  rejectReason: r.RejectReason,
  categoryId: r.CategoryId === null ? null : String(r.CategoryId),
  requestedBy: { id: String(r.RequestedById), displayName: r.RequestedByName ?? '' },
  reviewedBy: r.ReviewedByName,
  reviewedAt: r.ReviewedAt,
  createdAt: r.CreatedAt,
});
export type CategoryRequest = ReturnType<typeof toJson>;

export async function createRequest(data: { parentId: number; name: string; iconName: string; note: string; userId: number }) {
  const row = await queryOne<{ Id: number }>(
    `INSERT INTO WebManualCategoryRequests (ParentId, Name, IconName, Note, RequestedById)
     OUTPUT INSERTED.Id VALUES (@parentId, @name, @iconName, @note, @userId)`,
    data,
  );
  return (await findRequest(row!.Id))!;
}

export async function findRequest(id: number, tx?: Tx): Promise<CategoryRequest | null> {
  const row = await queryOne<Row>(`${SELECT} WHERE r.Id = @id`, { id }, tx);
  return row && toJson(row);
}

// Đề xuất của một người (mới nhất trước) / mọi đề xuất theo trạng thái (cũ nhất trước: duyệt theo thứ tự gửi).
export async function listRequestsByUser(userId: number): Promise<CategoryRequest[]> {
  return (await query<Row>(`${SELECT} WHERE r.RequestedById = @userId ORDER BY r.CreatedAt DESC`, { userId })).map(toJson);
}
export async function listRequestsByStatus(status: RequestStatus): Promise<CategoryRequest[]> {
  const order = status === 'pending' ? 'r.CreatedAt' : 'r.ReviewedAt DESC';
  return (await query<Row>(`${SELECT} WHERE r.Status = @status ORDER BY ${order}`, { status })).map(toJson);
}

export async function countPendingRequests(): Promise<number> {
  const row = await queryOne<{ Total: number }>(`SELECT COUNT(*) AS Total FROM WebManualCategoryRequests WHERE Status = N'pending'`);
  return row?.Total ?? 0;
}

// Đã có đề xuất ĐANG CHỜ trùng tên trong cùng thể loại cha chưa (chặn gửi trùng).
export async function hasPendingDuplicate(parentId: number, name: string): Promise<boolean> {
  return !!(await queryOne(
    `SELECT 1 AS Found FROM WebManualCategoryRequests WHERE Status = N'pending' AND ParentId = @parentId AND Name = @name`,
    { parentId, name },
  ));
}

// Duyệt / từ chối. Điều kiện Status = 'pending' trong WHERE: 2 admin bấm cùng lúc
// thì chỉ một người "thắng" (người sau nhận 0 dòng -> báo đã được xử lý).
export async function markApproved(id: number, data: { name: string; iconName: string; categoryId: number; adminId: number }, tx: Tx) {
  return execute(
    `UPDATE WebManualCategoryRequests
     SET Status = N'approved', Name = @name, IconName = @iconName, CategoryId = @categoryId,
         ReviewedById = @adminId, ReviewedAt = SYSUTCDATETIME()
     WHERE Id = @id AND Status = N'pending'`,
    { id, ...data },
    tx,
  );
}
export async function markRejected(id: number, reason: string | null, adminId: number) {
  return execute(
    `UPDATE WebManualCategoryRequests
     SET Status = N'rejected', RejectReason = @reason, ReviewedById = @adminId, ReviewedAt = SYSUTCDATETIME()
     WHERE Id = @id AND Status = N'pending'`,
    { id, reason, adminId },
  );
}

export async function deletePendingRequest(id: number, userId: number) {
  return execute(`DELETE FROM WebManualCategoryRequests WHERE Id = @id AND RequestedById = @userId AND Status = N'pending'`, { id, userId });
}
