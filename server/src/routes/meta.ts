// ============================================================
// routes/meta.ts — Thông tin máy chủ cho client
// ============================================================
//   GET /api/meta -> { publicBaseUrl, lanAddresses, drawio }
//
// Dùng khi tạo mã QR: điện thoại không mở được "localhost" (localhost
// của điện thoại là chính nó). Client cần biết IP mạng LAN của máy chủ
// để ghép thành link điện thoại mở được.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.ts';

export const metaRouter = Router();

// Các địa chỉ IPv4 trong mạng LAN của máy chủ (bỏ 127.0.0.1).
function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

metaRouter.get('/', (_req, res) => {
  res.json({
    publicBaseUrl: config.publicBaseUrl || null,
    lanAddresses: lanAddresses(),
    // Đã cài draw.io chưa -> trình soạn biết có mở được trình vẽ không.
    drawio: fs.existsSync(path.join(config.drawioDir, 'index.html')),
  });
});
