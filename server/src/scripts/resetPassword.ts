// ============================================================
// scripts/resetPassword.ts — Đặt lại mật khẩu khi quên (chạy trên máy chủ)
// ============================================================
// Dùng khi admin quên mật khẩu và không còn ai đăng nhập được:
//   npm run reset-password -- <tên đăng nhập> <mật khẩu mới>
// Chỉ người có quyền vào máy chủ mới chạy được lệnh này.

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../config.ts';
import { UserModel } from '../models/User.ts';
import { BCRYPT_ROUNDS } from '../routes/auth.ts';

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Cách dùng: npm run reset-password -- <tên đăng nhập> <mật khẩu mới, tối thiểu 8 ký tự>');
  process.exit(1);
}

await mongoose.connect(config.mongoUri);
const user = await UserModel.findOne({ username: username.toLowerCase() });
if (!user) {
  console.error(`❌ Không có tài khoản "${username}"`);
} else {
  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await user.save();
  console.log(`✅ Đã đặt lại mật khẩu cho "${user.username}" (${user.role})`);
}
await mongoose.disconnect();
