// ============================================================
// User.ts — Tài khoản người SOẠN tài liệu
// ============================================================
// Khách xem tài liệu không cần tài khoản. Chỉ editor/admin mới có.
//   editor — soạn, sửa, xóa tài liệu; upload media
//   admin  — như editor + quản lý thể loại và tài khoản

import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { toJSON } from './toJSON.ts';

export const ROLES = ['admin', 'editor'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, 'Tên đăng nhập không được để trống'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9._-]{3,32}$/, 'Tên đăng nhập 3–32 ký tự: chữ không dấu, số, dấu . _ -'],
    },
    displayName: { type: String, required: [true, 'Tên hiển thị không được để trống'], trim: true },
    // Chỉ lưu bản BĂM (hash) của mật khẩu, không bao giờ lưu mật khẩu gốc.
    // `select: false`: mọi truy vấn mặc định KHÔNG lấy field này; muốn
    // lấy phải ghi rõ .select('+passwordHash') (chỉ ở chỗ đăng nhập).
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'editor' },
  },
  {
    timestamps: true,
    toJSON: {
      ...toJSON,
      // Chặn thêm một lớp: kể cả khi đã lỡ select passwordHash thì JSON
      // trả về client cũng không bao giờ có nó.
      transform(_doc: unknown, ret: Record<string, unknown>) {
        delete ret._id;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export type UserData = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserData>;

export const UserModel = model('User', userSchema);
