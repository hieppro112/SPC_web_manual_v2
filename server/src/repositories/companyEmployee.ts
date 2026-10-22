import { config } from '../config.ts';
import { queryOne } from '../db/pool.ts';
import { HttpError } from '../middleware/errorHandler.ts';


function quoteName(name:string): string{
    const parts = name.trim().split('.');
    const valid = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (parts.length === 0 || parts.some((p) => !valid.test(p))) {
        throw new HttpError(503, 'Cấu hình tên view nhân viên không hợp lệ, vui lòng liên hệ IT');
    }
    return parts.map((p) => `[${p}]`).join('.');
}

export function isEmployeeCheckEnabled(): boolean {
    return config.companyEmployeeView.trim() !== '';
}

// Tra mã nhân viên trong view của công ty.
//   tìm thấy     -> { department: 'Tên bộ phận' }
//   không thấy   -> null
//   lỗi SQL      -> HttpError 503 (KHÔNG cho đăng ký lọt)
export async function findCompanyEmployee(code: string): Promise<{ department: string } | null> {
  const sql = `SELECT TOP 1 Section FROM ${quoteName(config.companyEmployeeView)}
               WHERE Code = @code`;
  try {
    const row = await queryOne<{ Section: string | null }>(sql, { code: code.trim() });
    return row ? { department: row.Section ?? '' } : null;
  } catch (err) {
    console.error('❌ Không tra được mã nhân viên:', err instanceof Error ? err.message : err);
    throw new HttpError(503, 'Chưa kiểm tra được dữ liệu nhân viên, vui lòng liên hệ IT');
  }
}