// ============================================================
// features/media/publicBase.ts — Địa chỉ mà NGƯỜI KHÁC / ĐIỆN THOẠI mở được
// ============================================================
// Editor mở app bằng http://localhost:5173 thì link "localhost" gửi cho
// điện thoại là vô dụng (localhost của điện thoại là chính nó). Hàm này
// chọn địa chỉ thật:
//   1. PUBLIC_BASE_URL do admin cấu hình ở server  -> dùng luôn
//   2. đang mở bằng IP/tên máy thật                -> dùng chính địa chỉ đó
//   3. đang mở bằng localhost                       -> thay bằng IP LAN của máy chủ
// Có thể trả về nhiều địa chỉ (máy chủ nhiều card mạng) để người dùng chọn.

import type { ServerMeta } from '../../lib/types.ts';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function publicBaseUrls(meta: ServerMeta | undefined): string[] {
  if (meta?.publicBaseUrl) return [meta.publicBaseUrl.replace(/\/+$/, '')];

  const { protocol, hostname, port, origin } = window.location;
  if (!LOCAL_HOSTS.includes(hostname)) return [origin];

  const portPart = port ? `:${port}` : '';
  const urls = (meta?.lanAddresses ?? []).map((ip) => `${protocol}//${ip}${portPart}`);
  return urls.length > 0 ? urls : [origin];
}
