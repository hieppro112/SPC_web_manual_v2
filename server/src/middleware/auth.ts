// ============================================================
// middleware/auth.ts — Biết "ai đang gọi API"
// ============================================================
// Đăng nhập xong, server gửi về một cookie `token` (JWT) kiểu httpOnly:
// JavaScript trên trang KHÔNG đọc được cookie này, nên kể cả khi trang
// bị chèn script độc thì token cũng không bị lấy cắp. Trình duyệt tự
// đính kèm cookie vào mọi request /api, client không phải làm gì.
//
//   loadUser    — chạy cho MỌI request: có token hợp lệ thì gắn user vào
//                 res.locals.user, không có thì coi là khách (không lỗi)
//   requireAuth — đặt trước route cần đăng nhập: khách -> 401
//   requireAdmin— đặt trước route chỉ admin: không phải admin -> 403
//
// 🔸 Flutter: giống một Dio interceptor đọc token, nhưng ở phía server.

import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { findUserById, type User } from '../repositories/users.ts';
import { HttpError } from './errorHandler.ts';

const COOKIE_NAME = 'token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

// Khai báo cho TypeScript biết res.locals có thêm field `user`.
// `declare global` chỉ là khai báo kiểu, lúc chạy bị xóa hoàn toàn.
declare global {
  namespace Express {
    interface Locals {
      user?: User;
    }
  }
}

export function setAuthCookie(res: Response, user: User): void {
  // `sub` (subject) của JWT phải là chuỗi -> String(id).
  const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    // lax: trang web KHÁC không gửi kèm được cookie này trong request
    // POST/PUT/DELETE -> chặn kiểu tấn công CSRF.
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: MAX_AGE_MS,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure });
}

export const loadUser: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[COOKIE_NAME];
  let userId: number | null = null;
  if (typeof token === 'string' && token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const sub = typeof payload === 'object' ? Number(payload.sub) : NaN;
      if (Number.isInteger(sub) && sub > 0) userId = sub;
    } catch {
      // Token sai chữ ký / hết hạn -> coi như khách, không báo lỗi.
    }
  }
  if (userId) {
    // Đọc lại user từ DB thay vì tin hoàn toàn vào token: tài khoản bị
    // xóa hoặc bị đổi quyền thì có hiệu lực NGAY, không đợi token hết hạn.
    // (Để NGOÀI try/catch: DB lỗi thì báo lỗi thật, không lặng lẽ coi là khách.)
    const user = await findUserById(userId);
    // Chỉ tài khoản đang hoạt động mới được coi là "đã đăng nhập".
    if (user && user.status === 'active') res.locals.user = user;
  }
  next();
};

export const requireAuth: RequestHandler = (_req, res, next) => {
  if (!res.locals.user) throw new HttpError(401, 'Bạn cần đăng nhập');
  next();
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (!res.locals.user) throw new HttpError(401, 'Bạn cần đăng nhập');
  if (res.locals.user.role !== 'admin') throw new HttpError(403, 'Chỉ admin được làm việc này');
  next();
};

// Lấy user trong route ĐÃ có requireAuth phía trước — chắc chắn có.
export function currentUser(res: Response): User {
  const user = res.locals.user;
  if (!user) throw new HttpError(401, 'Bạn cần đăng nhập');
  return user;
}
