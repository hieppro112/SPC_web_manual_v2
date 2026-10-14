// ============================================================
// services/ai/rateLimit.ts — Giới hạn số câu hỏi của khách chưa đăng nhập
// ============================================================
// Mỗi IP tối đa N câu trong 60 phút gần nhất ("cửa sổ trượt"). Giữ trong
// bộ nhớ: khởi động lại server thì đếm lại từ đầu — chấp nhận được.
// Người đã đăng nhập không bị giới hạn.

import { config } from '../../config.ts';

const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

const recent = (ip: string, now: number) => (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

// Còn hỏi được mấy câu.
export function remainingFor(ip: string): number {
  return Math.max(0, config.ai.guestLimitPerHour - recent(ip, Date.now()).length);
}

// Ghi nhận một câu hỏi. Hết lượt -> trả về số phút phải chờ; còn lượt -> null.
export function takeGuestQuota(ip: string): number | null {
  const now = Date.now();
  const list = recent(ip, now);
  if (list.length >= config.ai.guestLimitPerHour) {
    return Math.ceil((WINDOW_MS - (now - list[0])) / 60000);
  }
  list.push(now);
  hits.set(ip, list);
  return null;
}

// Dọn IP lâu không hỏi để Map không phình mãi.
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!recent(ip, now).length) hits.delete(ip);
}, WINDOW_MS).unref();
