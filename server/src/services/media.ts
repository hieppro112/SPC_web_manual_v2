// ============================================================
// services/media.ts — Xử lý file vừa upload
// ============================================================
// Dùng chung cho 2 đường upload: từ máy tính (routes/media.ts) và từ
// điện thoại quét QR (routes/uploadSessions.ts).
//
// multer ghi file tạm vào uploads/tmp/ trước. Hàm storeUpload() quyết định
// số phận file tạm đó:
//   ảnh  -> xoay đúng chiều + thu nhỏ còn tối đa 1920px + đổi sang WebP
//           (ảnh điện thoại 4–8 MB còn khoảng 200–400 KB)
//   video-> giữ nguyên, chuyển vào uploads/videos/
//   khác -> giữ nguyên, chuyển vào uploads/files/ (luôn bị TẢI VỀ khi mở,
//           không bao giờ được trình duyệt hiển thị/chạy — xem index.ts)

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import type { Types } from 'mongoose';
import { config } from '../config.ts';
import { MediaModel, type MediaKind } from '../models/Media.ts';
import { HttpError } from '../middleware/errorHandler.ts';

const MAX_IMAGE_SIZE = 1920;

// Thư mục con theo loại media.
const SUBDIRS: Record<MediaKind, string> = { image: 'images', video: 'videos', file: 'files' };

// Tạo sẵn các thư mục lúc khởi động (recursive: có rồi thì thôi, không lỗi).
export function ensureUploadDirs(): void {
  for (const sub of ['tmp', ...Object.values(SUBDIRS)]) {
    fs.mkdirSync(path.join(config.uploadDir, sub), { recursive: true });
  }
}

// Middleware nhận đúng 1 file ở field "file" của form multipart.
export const uploadSingle = multer({
  dest: path.join(config.uploadDir, 'tmp'),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
}).single('file');

// Đuôi file ảnh/video lấy theo MIME (danh sách cho phép), KHÔNG lấy theo
// tên file người dùng gửi. Nếu lấy theo tên, kẻ xấu đặt "x.html" kèm MIME
// video/mp4 là server sẽ phục vụ một trang HTML chứa script độc.
const VIDEO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/ogg': '.ogv',
};

function kindOf(mime: string): MediaKind {
  // SVG là ảnh nhưng có thể chứa script -> coi như file đính kèm.
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (VIDEO_EXT[mime]) return 'video';
  return 'file';
}

// multer giải mã tên file theo latin1, tên tiếng Việt thành "BÃ¡o cÃ¡o".
// Đổi lại sang UTF-8. Nếu kết quả có ký tự lỗi (�) thì tên gốc vốn đã
// đúng -> giữ nguyên.
function fixFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

export async function storeUpload(file: Express.Multer.File, userId: Types.ObjectId | null) {
  const kind = kindOf(file.mimetype);
  const originalName = fixFileName(file.originalname);
  const id = randomBytes(12).toString('hex');
  const dir = path.join(config.uploadDir, SUBDIRS[kind]);

  let filename: string;
  let mime = file.mimetype;
  let size = file.size;
  let width: number | undefined;
  let height: number | undefined;

  if (kind === 'image' && file.mimetype !== 'image/gif') {
    filename = `${id}.webp`;
    try {
      const info = await sharp(file.path)
        // Ảnh điện thoại thường lưu "xoay 90°" trong metadata EXIF; rotate()
        // xoay hẳn điểm ảnh theo đó, nếu không ảnh hiện ra bị nằm ngang.
        .rotate()
        .resize({ width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(dir, filename));
      mime = 'image/webp';
      size = info.size;
      width = info.width;
      height = info.height;
    } catch {
      throw new HttpError(400, 'Không đọc được ảnh (định dạng không hỗ trợ hoặc file hỏng)');
    } finally {
      await fs.promises.rm(file.path, { force: true });
    }
  } else {
    // GIF giữ nguyên để không mất ảnh động; file thường giữ đuôi gốc
    // (đã lọc ký tự lạ) để người tải về mở được bằng đúng phần mềm.
    const ext =
      kind === 'image'
        ? '.gif'
        : kind === 'video'
          ? VIDEO_EXT[file.mimetype]
          : path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
    filename = `${id}${ext}`;
    await fs.promises.rename(file.path, path.join(dir, filename));
  }

  return MediaModel.create({
    kind,
    url: `/uploads/${SUBDIRS[kind]}/${filename}`,
    originalName,
    mime,
    size,
    width,
    height,
    uploadedBy: userId,
  });
}

// Lỗi xảy ra SAU khi multer đã ghi file tạm (vd token hết hạn) -> xóa file tạm.
export async function discardUpload(file: Express.Multer.File | undefined): Promise<void> {
  if (file) await fs.promises.rm(file.path, { force: true });
}
