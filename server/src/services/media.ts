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
import { config } from '../config.ts';
import { createMedia, type MediaKind } from '../repositories/media.ts';
import { HttpError } from '../middleware/errorHandler.ts';

const MAX_IMAGE_SIZE = 1920;

// Thư mục con theo loại media.
const SUBDIRS: Record<MediaKind, string> = { image: 'images', video: 'videos', file: 'files' };
// Ảnh SVG của khối "Sơ đồ" — không ghi vào bảng WebManualMedia (không
// hiện trong thư viện ảnh), chỉ là file đi kèm khối.
const DIAGRAM_DIR = 'diagrams';
const MAX_DIAGRAM_BYTES = 4 * 1024 * 1024;

// Tạo sẵn các thư mục lúc khởi động (recursive: có rồi thì thôi, không lỗi).
export function ensureUploadDirs(): void {
  for (const sub of ['tmp', DIAGRAM_DIR, ...Object.values(SUBDIRS)]) {
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
export function fixFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

export async function storeUpload(file: Express.Multer.File, userId: number | null) {
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

  return createMedia({
    kind,
    url: `/uploads/${SUBDIRS[kind]}/${filename}`,
    originalName,
    mime,
    size,
    width: width ?? null,
    height: height ?? null,
    uploadedById: userId,
  });
}

// Lưu ảnh từ bộ nhớ (vd ảnh lấy ra từ file PowerPoint) — cùng cách xử lý như
// ảnh upload: xoay đúng chiều, thu nhỏ tối đa 1920px, đổi sang WebP.
// Ảnh hỏng / định dạng lạ -> trả null (bỏ qua ảnh đó, không làm hỏng cả việc nhập).
export async function storeImageBuffer(data: Uint8Array, originalName: string, userId: number | null) {
  const filename = `${randomBytes(12).toString('hex')}.webp`;
  try {
    const info = await sharp(data)
      .rotate()
      .resize({ width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(config.uploadDir, SUBDIRS.image, filename));
    return createMedia({
      kind: 'image',
      url: `/uploads/${SUBDIRS.image}/${filename}`,
      originalName,
      mime: 'image/webp',
      size: info.size,
      width: info.width,
      height: info.height,
      uploadedById: userId,
    });
  } catch {
    return null;
  }
}

// Lưu ảnh SVG do draw.io xuất ra. SVG là XML có thể chứa script, nên:
//   1. từ chối nếu thấy dấu hiệu script (ở đây)
//   2. phục vụ kèm header CSP cấm chạy script (xem index.ts)
// Hiển thị bằng <img> thì trình duyệt vốn đã không chạy script trong SVG;
// 2 lớp trên chặn trường hợp ai đó mở thẳng link file SVG.
export async function storeDiagramSvg(svg: string): Promise<string> {
  if (Buffer.byteLength(svg) > MAX_DIAGRAM_BYTES) throw new HttpError(413, 'Sơ đồ quá lớn (tối đa 4 MB)');
  const head = svg.slice(0, 2000).trimStart();
  if (!/^(<\?xml[^>]*>\s*)?(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    throw new HttpError(400, 'Dữ liệu không phải ảnh SVG');
  }
  // Chỉ xét BÊN TRONG thẻ (<...>), để chữ thường trên sơ đồ như
  // "online = true" không bị chặn nhầm.
  if (/<\s*(script|iframe|embed|object)\b|<[^>]*\son[a-z]+\s*=|<[^>]*href\s*=\s*["']?\s*javascript:/i.test(svg)) {
    throw new HttpError(400, 'Ảnh SVG chứa nội dung không cho phép');
  }
  const filename = `${randomBytes(12).toString('hex')}.svg`;
  await fs.promises.writeFile(path.join(config.uploadDir, DIAGRAM_DIR, filename), svg, 'utf8');
  return `/uploads/${DIAGRAM_DIR}/${filename}`;
}

// Lỗi xảy ra SAU khi multer đã ghi file tạm (vd token hết hạn) -> xóa file tạm.
export async function discardUpload(file: Express.Multer.File | undefined): Promise<void> {
  if (file) await fs.promises.rm(file.path, { force: true });
}
