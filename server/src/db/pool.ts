// ============================================================
// db/pool.ts — Kết nối SQL Server + hàm truy vấn dùng chung
// ============================================================
// "Connection pool" = một nhóm kết nối mở sẵn tới SQL Server, dùng đi
// dùng lại cho mọi request (mở kết nối mới mỗi lần rất chậm).
//
// Mọi câu SQL trong app đi qua 3 hàm ở đây:
//   query<T>(sql, params)  -> mảng dòng kết quả
//   execute(sql, params)   -> số dòng bị ảnh hưởng (UPDATE/DELETE)
//   withTransaction(fn)    -> chạy nhiều câu SQL "cùng sống cùng chết"
//
// LUÔN truyền giá trị qua `params` (@ten), KHÔNG ghép chuỗi vào SQL:
//   ✅ query('SELECT * FROM WebManualUsers WHERE Username = @username', { username })
//   ❌ query(`SELECT * FROM WebManualUsers WHERE Username = '${username}'`)
// Ghép chuỗi là lỗ hổng SQL injection: người dùng gõ ' OR 1=1 -- là vào được.
// 🔸 Flutter: giống truyền tham số `?` trong sqflite thay vì nối chuỗi.

import sql from 'mssql';
import { config } from '../config.ts';

let pool: sql.ConnectionPool | null = null;

export async function connectDb(): Promise<sql.ConnectionPool> {
  if (pool) return pool;
  pool = await new sql.ConnectionPool({
    server: config.db.server,
    port: config.db.instanceName ? undefined : config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    options: {
      instanceName: config.db.instanceName,
      encrypt: config.db.encrypt,
      trustServerCertificate: config.db.trustServerCertificate,
      // Ngày giờ lưu theo UTC; trình duyệt tự đổi sang giờ địa phương khi hiển thị.
      useUTC: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  }).connect();
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.close();
  pool = null;
}

export function isDbConnected(): boolean {
  return !!pool?.connected;
}

export type Params = Record<string, unknown>;
// Một câu SQL chạy bên trong transaction thì truyền `tx` vào.
export type Tx = sql.Transaction;

async function makeRequest(params: Params, tx?: Tx): Promise<sql.Request> {
  const request = tx ? new sql.Request(tx) : (await connectDb()).request();
  for (const [name, value] of Object.entries(params)) {
    // mssql tự đoán kiểu SQL theo kiểu JS: string -> NVARCHAR (giữ đúng
    // tiếng Việt), number nguyên -> INT, Date -> DATETIME, null -> NULL.
    request.input(name, value);
  }
  return request;
}

export async function query<T>(text: string, params: Params = {}, tx?: Tx): Promise<T[]> {
  const result = await (await makeRequest(params, tx)).query<T>(text);
  return result.recordset ?? [];
}

// Lấy dòng đầu tiên (hoặc null) — cho các câu SELECT theo id.
export async function queryOne<T>(text: string, params: Params = {}, tx?: Tx): Promise<T | null> {
  return (await query<T>(text, params, tx))[0] ?? null;
}

export async function execute(text: string, params: Params = {}, tx?: Tx): Promise<number> {
  const result = await (await makeRequest(params, tx)).query(text);
  return result.rowsAffected.reduce((sum, n) => sum + n, 0);
}

// Transaction: hoặc MỌI câu trong `fn` đều thành công, hoặc không câu nào
// được ghi (lỗi giữa chừng -> rollback, DB trở về như trước).
// Ví dụ: lưu tài liệu + lưu bản chụp phiên bản phải luôn đi cùng nhau.
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = new sql.Transaction(await connectDb());
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

// Chuỗi tìm kiếm trong LIKE: thoát các ký tự đặc biệt % _ [ để người dùng
// gõ "50%" thì tìm đúng chuỗi "50%", không bị hiểu là ký tự đại diện.
export function escapeLike(value: string): string {
  return value.replace(/[[%_]/g, (ch) => `[${ch}]`);
}
