// ============================================================
// repositories/companyEmails.ts — Email có trong danh sách nhân viên công ty không?
// ============================================================
// Đọc một VIEW do IT tạo (COMPANY_EMAIL_VIEW trong .env), vd:
//   CREATE VIEW dbo.WebManualCompanyEmails AS
//     SELECT Email, DangLamViec FROM <bảng nhân viên>
// Web chỉ đọc đúng cột email (+ cột "đang làm việc" nếu có) — không thấy
// dữ liệu nhân viên nào khác.
//
// Tên view / cột lấy từ .env nên KHÔNG truyền được qua tham số @...; phải ghép
// vào câu SQL -> chỉ cho phép chữ, số, "_" và đặt trong [ ] (chống SQL injection).

import { config } from '../config.ts';
import { queryOne } from '../db/pool.ts';
import { HttpError } from '../middleware/errorHandler.ts';

// "dbo.WebManualCompanyEmails" -> "[dbo].[WebManualCompanyEmails]"
function quoteName(name: string): string {
  const parts = name.split('.').map((p) => p.trim().replace(/^\[|\]$/g, ''));
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p))) {
    throw new HttpError(503, `Tên "${name}" trong cấu hình danh sách email công ty không hợp lệ — liên hệ IT`);
  }
  return parts.map((p) => `[${p}]`).join('.');
}

// null = chưa cấu hình view (tắt kiểm tra).
export async function isCompanyEmail(email: string): Promise<boolean | null> {
  const { view, emailColumn, activeColumn } = config.companyEmails;
  if (!view.trim()) return null;
  const sql = `SELECT TOP 1 1 AS Found FROM ${quoteName(view)}
               WHERE LOWER(LTRIM(RTRIM(${quoteName(emailColumn)}))) = @email
               ${activeColumn ? `AND ${quoteName(activeColumn)} = 1` : ''}`;
  try {
    return !!(await queryOne(sql, { email: email.trim().toLowerCase() }));
  } catch (err) {
    // Sai tên view / cột, hoặc kvh_write chưa được quyền đọc view -> báo IT, không cho đăng ký "lọt".
    console.error('❌ Không đọc được danh sách email công ty:', err instanceof Error ? err.message : err);
    throw new HttpError(503, 'Chưa kiểm tra được danh sách email công ty, vui lòng liên hệ IT');
  }
}
