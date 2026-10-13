// ============================================================
// routes/media.ts — Upload từ máy tính + thư viện media
// ============================================================
//   POST /api/media          multipart, field "file"  -> Media
//   GET  /api/media?kind=image                         -> Media[] (mới nhất trước)
//   POST /api/media/diagram  JSON { svg }              -> { url } (ảnh của khối Sơ đồ)
// Cả router cần đăng nhập (requireAuth gắn ở index.ts).

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser } from '../middleware/auth.ts';
import { MEDIA_KINDS, listMedia, type MediaKind } from '../repositories/media.ts';
import { storeDiagramSvg, storeUpload, uploadSingle } from '../services/media.ts';

export const mediaRouter = Router();

mediaRouter.post('/', uploadSingle, async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Chưa chọn file');
  const { rawId: _rawId, ...media } = await storeUpload(req.file, currentUser(res).id);
  res.status(201).json(media);
});

const diagramSchema = z.object({ svg: z.string().min(1, 'Thiếu ảnh sơ đồ') });

mediaRouter.post('/diagram', async (req, res) => {
  const { svg } = diagramSchema.parse(req.body);
  res.status(201).json({ url: await storeDiagramSvg(svg) });
});

mediaRouter.get('/', async (req, res) => {
  const kind = req.query.kind;
  res.json(await listMedia(MEDIA_KINDS.includes(kind as MediaKind) ? (kind as MediaKind) : undefined));
});
