// ============================================================
// repositories/users.ts — Mọi câu SQL của bảng Users
// ============================================================
// Repository = nơi DUY NHẤT viết SQL cho một bảng. Route chỉ gọi hàm ở
// đây, không viết SQL trực tiếp.
// 🔸 Flutter: đúng "Repository pattern" — UI/logic không biết dữ liệu
//    nằm ở đâu, chỉ gọi userRepository.findById(...).
//
// Cột trong DB viết PascalCase (DisplayName), dữ liệu trả cho client viết
// camelCase (displayName) — hàm toUser() đổi giữa hai kiểu.

import { execute, query, queryOne, withTransaction, type Tx } from '../db/pool.ts';

export const ROLES = ['admin', 'editor'] as const;
export type Role = (typeof ROLES)[number];
export type UserStatus = 'active' | 'pending';

type UserRow = {
  Id: number;
  Username: string;
  DisplayName: string;
  Email: string | null;
  Role: Role;
  Status: UserStatus;
  CreatedAt: Date;
  UpdatedAt: Date;
};

export type User = {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

// Dạng gửi cho client: id là chuỗi (giống hồi dùng MongoDB). KHÔNG BAO GIỜ
// có PasswordHash — cột đó không có trong USER_COLUMNS bên dưới.
export function userToJson(user: User) {
  return { ...user, id: String(user.id) };
}

const USER_COLUMNS = 'Id, Username, DisplayName, Email, Role, Status, CreatedAt, UpdatedAt';

function toUser(row: UserRow): User {
  return {
    id: row.Id,
    username: row.Username,
    displayName: row.DisplayName,
    email: row.Email,
    role: row.Role,
    status: row.Status,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

export async function findUserById(id: number): Promise<User | null> {
  const row = await queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM Users WHERE Id = @id`, { id });
  return row && toUser(row);
}

// Đăng nhập: tìm theo tên đăng nhập HOẶC email, lấy kèm PasswordHash.
export async function findUserForLogin(login: string): Promise<{ user: User; passwordHash: string } | null> {
  const column = login.includes('@') ? 'Email' : 'Username';
  const row = await queryOne<UserRow & { PasswordHash: string }>(
    `SELECT ${USER_COLUMNS}, PasswordHash FROM Users WHERE ${column} = @login`,
    { login },
  );
  return row && { user: toUser(row), passwordHash: row.PasswordHash };
}

export async function getPasswordHash(id: number): Promise<string | null> {
  const row = await queryOne<{ PasswordHash: string }>('SELECT PasswordHash FROM Users WHERE Id = @id', { id });
  return row?.PasswordHash ?? null;
}

export async function countUsers(): Promise<number> {
  const row = await queryOne<{ Total: number }>('SELECT COUNT(*) AS Total FROM Users');
  return row?.Total ?? 0;
}

// Số admin ĐANG HOẠT ĐỘNG khác `exceptId` — để chặn xóa/hạ quyền admin cuối cùng.
export async function countOtherActiveAdmins(exceptId: number): Promise<number> {
  const row = await queryOne<{ Total: number }>(
    `SELECT COUNT(*) AS Total FROM Users WHERE Role = N'admin' AND Status = N'active' AND Id <> @exceptId`,
    { exceptId },
  );
  return row?.Total ?? 0;
}

export async function listUsers(): Promise<User[]> {
  return (await query<UserRow>(`SELECT ${USER_COLUMNS} FROM Users ORDER BY CreatedAt, Id`)).map(toUser);
}

export type NewUser = {
  username: string;
  displayName: string;
  email: string | null;
  passwordHash: string;
  role: Role;
  status: UserStatus;
};

export async function createUser(data: NewUser): Promise<User> {
  // OUTPUT INSERTED.* : trả về luôn dòng vừa thêm (kèm Id tự tăng), khỏi
  // phải SELECT lại lần nữa.
  const row = await queryOne<UserRow>(
    `INSERT INTO Users (Username, DisplayName, Email, PasswordHash, Role, Status)
     OUTPUT ${USER_COLUMNS.split(', ').map((c) => `INSERTED.${c}`).join(', ')}
     VALUES (@username, @displayName, @email, @passwordHash, @role, @status)`,
    data,
  );
  return toUser(row!);
}

export type UserChanges = Partial<{ displayName: string; role: Role; status: UserStatus; passwordHash: string }>;

// Chỉ cập nhật những cột có trong `changes`.
export async function updateUser(id: number, changes: UserChanges): Promise<User | null> {
  const COLUMN: Record<keyof UserChanges, string> = {
    displayName: 'DisplayName',
    role: 'Role',
    status: 'Status',
    passwordHash: 'PasswordHash',
  };
  const keys = (Object.keys(changes) as (keyof UserChanges)[]).filter((k) => changes[k] !== undefined);
  if (keys.length) {
    const sets = keys.map((k) => `${COLUMN[k]} = @${k}`).join(', ');
    await execute(`UPDATE Users SET ${sets}, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id`, { ...changes, id });
  }
  return findUserById(id);
}

// Xóa tài khoản. Các bảng khác có khóa ngoại trỏ tới Users (người tạo /
// sửa tài liệu, người upload...) -> gỡ liên kết về NULL trước, rồi mới xóa.
// Tài liệu vẫn còn nguyên, chỉ không còn hiện tên người sửa.
export async function deleteUser(id: number): Promise<void> {
  await withTransaction(async (tx: Tx) => {
    await execute('UPDATE Documents SET CreatedById = NULL WHERE CreatedById = @id', { id }, tx);
    await execute('UPDATE Documents SET UpdatedById = NULL WHERE UpdatedById = @id', { id }, tx);
    await execute('UPDATE DocumentVersions SET SavedById = NULL WHERE SavedById = @id', { id }, tx);
    await execute('UPDATE Media SET UploadedById = NULL WHERE UploadedById = @id', { id }, tx);
    await execute('DELETE FROM UploadSessions WHERE CreatedById = @id', { id }, tx);
    await execute('DELETE FROM Users WHERE Id = @id', { id }, tx);
  });
}
