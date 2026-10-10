// ============================================================
// routes/media.ts — Upload từ máy tính + thư viện media
// ============================================================
//   POST /api/media          multipart, field "file"  -> Media
//   GET  /api/media?kind=image                         -> Media[] (mới nhất trước)
// Cả router cần đăng nhập (requireAuth gắn ở index.ts).

import { Router } from 'express';
import { MEDIA_KINDS, MediaModel, type MediaKind } from '../models/Media.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser } from '../middleware/auth.ts';
import { storeUpload, uploadSingle } from '../services/media.ts';

export const mediaRouter = Router();

mediaRouter.post('/', uploadSingle, async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Chưa chọn file');
  const media = await storeUpload(req.file, currentUser(res)._id);
  res.status(201).json(media);
});

mediaRouter.get('/', async (req, res) => {
  const kind = req.query.kind;
  const filter = MEDIA_KINDS.includes(kind as MediaKind) ? { kind: kind as MediaKind } : {};
  const items = await MediaModel.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(items);
});
