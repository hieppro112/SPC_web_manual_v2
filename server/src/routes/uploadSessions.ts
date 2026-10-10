// ============================================================
// routes/uploadSessions.ts — Quét QR để upload ảnh/video từ điện thoại
// ============================================================
//   POST /api/upload-sessions              (editor)   { kind } -> { token, expiresAt }
//   GET  /api/upload-sessions/:token       (ai cũng gọi được, có token là đủ)
//                                           -> { kind, status, expiresAt, media }
//   POST /api/upload-sessions/:token/file  (điện thoại, multipart "file")
//
// Máy tính gọi GET mỗi 2 giây để biết điện thoại đã gửi ảnh chưa.

import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { SESSION_TTL_MINUTES, UploadSessionModel } from '../models/UploadSession.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, requireAuth } from '../middleware/auth.ts';
import { discardUpload, storeUpload, uploadSingle } from '../services/media.ts';

export const uploadSessionsRouter = Router();

// Tìm phiên còn hạn theo token; không có / hết hạn -> 404.
async function findActiveSession(token: string) {
  const session = await UploadSessionModel.findOne({ token }).populate('media');
  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw new HttpError(404, 'Mã QR không tồn tại hoặc đã hết hạn');
  }
  return session;
}

uploadSessionsRouter.post('/', requireAuth, async (req, res) => {
  const { kind } = z.object({ kind: z.enum(['image', 'video']).default('image') }).parse(req.body ?? {});
  const session = await UploadSessionModel.create({
    // 24 byte ngẫu nhiên = 48 ký tự hex: không thể đoán mò.
    token: randomBytes(24).toString('hex'),
    kind,
    createdBy: currentUser(res)._id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000),
  });
  res.status(201).json(session);
});

uploadSessionsRouter.get('/:token', async (req, res) => {
  const session = await findActiveSession(req.params.token);
  // Chỉ trả những gì cần; KHÔNG trả createdBy cho người ngoài.
  res.json({ kind: session.kind, status: session.status, expiresAt: session.expiresAt, media: session.media ?? null });
});

// Kiểm tra token TRƯỚC khi nhận file: token sai thì từ chối ngay, không
// để điện thoại upload xong cả video 200 MB rồi mới báo lỗi.
const checkSessionBeforeUpload: RequestHandler = async (req, res, next) => {
  const session = await findActiveSession(String(req.params.token));
  if (session.status === 'done') throw new HttpError(409, 'Mã QR này đã được dùng');
  res.locals.uploadSessionId = session.id;
  next();
};

uploadSessionsRouter.post('/:token/file', checkSessionBeforeUpload, uploadSingle, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Chưa chọn file');

  const session = await UploadSessionModel.findById(res.locals.uploadSessionId);
  if (!session) {
    await discardUpload(file);
    throw new HttpError(404, 'Mã QR không tồn tại hoặc đã hết hạn');
  }
  const expectImage = session.kind === 'image';
  if (expectImage ? !file.mimetype.startsWith('image/') : !file.mimetype.startsWith('video/')) {
    await discardUpload(file);
    throw new HttpError(400, expectImage ? 'Hãy chọn một ảnh' : 'Hãy chọn một video');
  }

  const media = await storeUpload(file, session.createdBy);
  if (media.kind !== session.kind) throw new HttpError(400, 'Định dạng file không được hỗ trợ');

  // "Giành" phiên một cách NGUYÊN TỬ: chỉ cập nhật nếu vẫn còn 'pending'.
  // Hai điện thoại cùng quét một mã và gửi cùng lúc thì chỉ một cái thắng.
  const claimed = await UploadSessionModel.findOneAndUpdate(
    { _id: session._id, status: 'pending' },
    { status: 'done', media: media._id },
  );
  if (!claimed) throw new HttpError(409, 'Mã QR này đã được dùng');
  res.status(201).json(media);
});
