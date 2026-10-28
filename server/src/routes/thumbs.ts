// ============================================================
// routes/thumbs.ts — Ảnh thu nhỏ cho thẻ tài liệu ở trang chủ
// ============================================================
//   GET /uploads/thumbs/<tên file trong uploads/images>   -> ảnh WebP rộng 640px
//
// Ảnh gốc tối đa 1920px (~200–400 KB). Trang chủ có hàng chục thẻ, mỗi thẻ
// chỉ cần ảnh nhỏ (~30 KB). Lần đầu có người xin thì tạo bằng sharp rồi lưu
// vào uploads/thumbs/, các lần sau trả thẳng file đã lưu.
// Ảnh gốc không bao giờ bị sửa (tên ngẫu nhiên) -> ảnh nhỏ cũng không bao giờ cũ.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import sharp from 'sharp';
import { config } from '../config.ts';

export const thumbsRouter = Router();

const THUMB_WIDTH = 640;
const IMAGES_DIR = path.join(config.uploadDir, 'images');
const THUMBS_DIR = path.join(config.uploadDir, 'thumbs');
// Chỉ chữ, số, gạch, chấm: chặn "../" lấy file ngoài thư mục ảnh.
const SAFE_NAME = /^[\w-]+\.(webp|gif|png|jpe?g)$/i;

thumbsRouter.get('/:file', async (req, res) => {
  const file = req.params.file;
  if (!SAFE_NAME.test(file)) {
    res.status(404).end();
    return;
  }
  const source = path.join(IMAGES_DIR, file);
  const thumb = path.join(THUMBS_DIR, `${file}.webp`);
  const send = () =>
    res.sendFile(thumb, {
      maxAge: '30d',
      immutable: true,
      headers: { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' },
    });

  if (fs.existsSync(thumb)) {
    send();
    return;
  }
  if (!fs.existsSync(source)) {
    res.status(404).end();
    return;
  }
  try {
    await fs.promises.mkdir(THUMBS_DIR, { recursive: true });
    // Ghi ra file tạm rồi đổi tên: 2 người mở trang cùng lúc không đọc phải file đang ghi dở.
    const tmp = `${thumb}.${randomBytes(4).toString('hex')}.tmp`;
    await sharp(source).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toFile(tmp);
    await fs.promises.rename(tmp, thumb);
    send();
  } catch {
    // Ảnh lạ sharp không đọc được: trả ảnh gốc, thẻ vẫn có ảnh.
    res.redirect(`/uploads/images/${file}`);
  }
});
