// ============================================================
// db/migrate.ts — Tự tạo / cập nhật cấu trúc bảng
// ============================================================
// Các file trong db/migrations/ chạy LẦN LƯỢT theo tên (001_, 002_...).
// Bảng SchemaMigrations ghi lại file nào đã chạy, nên mỗi file chỉ chạy
// đúng một lần trên mỗi database. Server gọi hàm này lúc khởi động:
// database trống -> tạo đủ bảng; có file mới -> chỉ chạy file mới.
// 🔸 Flutter: giống onUpgrade(oldVersion, newVersion) của sqflite.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute, query, withTransaction } from './pool.ts';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function runMigrations(): Promise<string[]> {
  await execute(`
    IF OBJECT_ID(N'SchemaMigrations', N'U') IS NULL
      CREATE TABLE SchemaMigrations (
        Name      NVARCHAR(200) NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
        AppliedAt DATETIME2(3)  NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME()
      );
  `);

  const applied = new Set((await query<{ Name: string }>('SELECT Name FROM SchemaMigrations')).map((r) => r.Name));
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // "GO" là dấu ngắt lô lệnh của SSMS, không phải lệnh SQL thật -> tách
    // thành từng lô và gửi lần lượt (một số lệnh như CREATE INDEX trên bảng
    // vừa tạo cần chạy ở lô riêng).
    const batches = sqlText
      .split(/^\s*GO\s*$/im)
      .map((b) => b.trim())
      .filter(Boolean);

    // Cả file chạy trong MỘT transaction: lỗi giữa chừng thì không để lại
    // database "nửa vời".
    await withTransaction(async (tx) => {
      for (const batch of batches) await execute(batch, {}, tx);
      await execute('INSERT INTO SchemaMigrations (Name) VALUES (@name)', { name: file }, tx);
    });
    ran.push(file);
  }
  return ran;
}
