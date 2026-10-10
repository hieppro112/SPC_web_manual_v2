// ============================================================
// lib/utils.ts — Hàm nhỏ dùng khắp nơi
// ============================================================

import { twMerge } from 'tailwind-merge';

// Ghép class Tailwind, bỏ qua giá trị false/undefined:
//   cn('px-2', active && 'bg-accent') -> "px-2 bg-accent" hoặc "px-2"
// twMerge còn xử lý class XUNG ĐỘT: cn('w-full', 'w-auto') -> "w-auto"
// (class truyền sau thắng). Thiếu nó, component dùng chung như <Input>
// có sẵn w-full thì nơi dùng không ghi đè được chiều rộng.
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}

// Sinh id cho khối/mục mới.
// KHÔNG dùng crypto.randomUUID(): hàm đó chỉ có trong "secure context"
// (HTTPS hoặc localhost). App chạy mạng nội bộ qua http://192.168.x.x
// thì crypto.randomUUID là undefined -> nổ ngay khi bấm thêm khối.
export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Bỏ dấu tiếng Việt: "Bảo trì" -> "bao tri". Khớp với server/src/utils/slugify.ts.
export function removeDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function slugify(input: string): string {
  return removeDiacritics(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// 1536000 -> "1.5 MB"
export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Định dạng ngày theo ngôn ngữ đang chọn (vi: 10/10/2026 14:30, ja: 2026/10/10 14:30).
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

// Sao chép chữ vào clipboard.
// navigator.clipboard cũng chỉ có trong secure context (HTTPS/localhost)
// -> mạng nội bộ http:// phải dùng cách cũ: tạo textarea ẩn rồi "copy".
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // rơi xuống cách cũ bên dưới
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  return ok;
}

// Đọc/ghi localStorage an toàn: trình duyệt chặn lưu trữ (chế độ ẩn danh,
// chính sách công ty) thì không làm sập app.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // bỏ qua
    }
  },
};

// Biến đường dẫn tương đối "/uploads/a.mp4" thành link đầy đủ (dùng cho QR in ra giấy).
export function absoluteUrl(src: string, base = window.location.origin): string {
  return src.startsWith('/') ? base + src : src;
}

// Lấy message từ lỗi bất kỳ để hiện cho người dùng.
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
