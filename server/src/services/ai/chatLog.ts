// ============================================================
// services/ai/chatLog.ts — Lưu lịch sử hỏi đáp ra file, tự xóa sau N ngày
// ============================================================
// Mỗi ngày một file ai-data/logs/2026-10-13.jsonl, mỗi dòng một lượt hỏi
// (JSON Lines: mở bằng Notepad đọc được, Excel/Power Query cũng đọc được).
// Có IP, tên đăng nhập và nội dung câu hỏi -> chỉ giữ config.ai.logDays ngày.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.ts';

const LOG_DIR = () => path.join(config.ai.dataDir, 'logs');

export type ChatLogEntry = {
  time: string;
  ip: string;
  user: string | null;
  mode: string;
  slug?: string;
  question: string;
  answer: string;
  sources: string[];
  ms: number;
  error?: string;
};

export function writeChatLog(entry: ChatLogEntry) {
  const day = entry.time.slice(0, 10);
  fs.mkdir(LOG_DIR(), { recursive: true }, () => {
    fs.appendFile(path.join(LOG_DIR(), `${day}.jsonl`), `${JSON.stringify(entry)}\n`, (err) => {
      if (err) console.error('❌ AI: không ghi được log:', err.message);
    });
  });
}

// Xóa file log cũ hơn N ngày. Chạy lúc khởi động và mỗi 6 giờ.
function cleanOldLogs() {
  const cutoff = new Date(Date.now() - config.ai.logDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let files: string[] = [];
  try {
    files = fs.readdirSync(LOG_DIR());
  } catch {
    return; // chưa có thư mục log
  }
  for (const file of files) {
    const day = file.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file) && day < cutoff) fs.rmSync(path.join(LOG_DIR(), file), { force: true });
  }
}

export function startLogCleanup() {
  if (!config.ai.baseUrl) return;
  cleanOldLogs();
  setInterval(cleanOldLogs, 6 * 60 * 60 * 1000).unref();
}
