// ============================================================
// routes/uploadSessions.ts — Quét QR để upload ảnh/video từ điện thoại
// ============================================================
//   POST /api/upload-sessions              (editor)   { kind } -> { token, kind, expiresAt }
//   GET  /api/upload-sessions/:token       (ai cũng gọi được, có token là đủ)
//                                           -> { kind, status, expiresAt, media }
//   POST /api/upload-sessions/:token/file  (điện thoại, multipart "file")
//
// Máy tính gọi GET mỗi 2 giây để biết điện thoại đã gửi ảnh chưa.

import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, requireEditor } from '../middleware/auth.ts';
import { claimSession, createUploadSession, findActiveSession } from '../repositories/media.ts';
import { discardUpload, storeUpload, uploadSingle } from '../services/media.ts';

export const uploadSessionsRouter = Router();

export const SESSION_TTL_MINUTES = 10;

async function findOr404(token: unknown) {
  const session = await findActiveSession(String(token));
  if (!session) throw new HttpError(404, 'Mã QR không tồn tại hoặc đã hết hạn');
  return session;
}

uploadSessionsRouter.post('/', requireEditor, async (req, res) => {
  const { kind } = z.object({ kind: z.enum(['image', 'video']).default('image') }).parse(req.body ?? {});
  // 24 byte ngẫu nhiên = 48 ký tự hex: không thể đoán mò.
  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
  res.status(201).json(await createUploadSession(token, kind, currentUser(res).id, expiresAt));
});

uploadSessionsRouter.get('/:token', async (req, res) => {
  const session = await findOr404(req.params.token);
  // Chỉ trả những gì cần; KHÔNG trả người tạo cho người ngoài.
  res.json({ kind: session.kind, status: session.status, expiresAt: session.expiresAt, media: session.media });
});

// Kiểm tra token TRƯỚC khi nhận file: token sai thì từ chối ngay, không
// để điện thoại upload xong cả video 200 MB rồi mới báo lỗi.
const checkSessionBeforeUpload: RequestHandler = async (req, res, next) => {
  const session = await findOr404(req.params.token);
  if (session.status === 'done') throw new HttpError(409, 'Mã QR này đã được dùng');
  res.locals.uploadSession = session;
  next();
};

uploadSessionsRouter.post('/:token/file', checkSessionBeforeUpload, uploadSingle, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Chưa chọn file');

  const session = res.locals.uploadSession as Awaited<ReturnType<typeof findOr404>>;
  const expectImage = session.kind === 'image';
  if (expectImage ? !file.mimetype.startsWith('image/') : !file.mimetype.startsWith('video/')) {
    await discardUpload(file);
    throw new HttpError(400, expectImage ? 'Hãy chọn một ảnh' : 'Hãy chọn một video');
  }

  const { rawId, ...media } = await storeUpload(file, session.createdById);
  if (media.kind !== session.kind) throw new HttpError(400, 'Định dạng file không được hỗ trợ');

  // Hai điện thoại cùng quét một mã và gửi cùng lúc thì chỉ một cái thắng.
  if (!(await claimSession(session.id, rawId))) throw new HttpError(409, 'Mã QR này đã được dùng');
  res.status(201).json(media);
});
