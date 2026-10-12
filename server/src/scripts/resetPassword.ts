// ============================================================
// scripts/resetPassword.ts — Đặt lại mật khẩu khi quên (chạy trên máy chủ)
// ============================================================
// Dùng khi admin quên mật khẩu và không còn ai đăng nhập được:
//   npm run reset-password -- <tên đăng nhập> <mật khẩu mới>
// Chỉ người có quyền vào máy chủ mới chạy được lệnh này.

import bcrypt from 'bcryptjs';
import { closeDb, connectDb, queryOne } from '../db/pool.ts';
import { updateUser } from '../repositories/users.ts';
import { BCRYPT_ROUNDS } from '../routes/auth.ts';

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Cách dùng: npm run reset-password -- <tên đăng nhập> <mật khẩu mới, tối thiểu 8 ký tự>');
  process.exit(1);
}

await connectDb();
const row = await queryOne<{ Id: number; Role: string }>('SELECT Id, Role FROM WebManualUsers WHERE Username = @username', {
  username: username.toLowerCase(),
});
if (!row) {
  console.error(`❌ Không có tài khoản "${username}"`);
} else {
  await updateUser(row.Id, { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) });
  console.log(`✅ Đã đặt lại mật khẩu cho "${username.toLowerCase()}" (${row.Role})`);
}
await closeDb();
