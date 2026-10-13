// ============================================================
// scripts/installDrawio.ts — Cài draw.io (tự host) cho khối "Sơ đồ"
// ============================================================
// draw.io (diagrams.net, mã nguồn mở Apache 2.0) được phát hành dạng file
// draw.war — thực chất là file .zip chứa toàn bộ trang web tĩnh. Script này
// giải nén nó vào thư mục DRAWIO_DIR (mặc định server/drawio), server phục
// vụ ở /drawio. Máy người dùng KHÔNG cần internet để vẽ.
//
//   npm run install-drawio                      tải bản cố định từ GitHub
//   npm run install-drawio -- D:\Tai\draw.war   dùng file đã tải sẵn
//                                               (máy chủ không có internet)
//
// Chạy lại để cài lại / nâng cấp (đổi DRAWIO_VERSION bên dưới).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DRAWIO_VERSION = '31.5.2';
const DOWNLOAD_URL = `https://github.com/jgraph/drawio/releases/download/v${DRAWIO_VERSION}/draw.war`;

// Không dùng config.ts: script này không cần kết nối database.
const targetDir = path.resolve(process.env.DRAWIO_DIR ?? 'drawio');
const localWar = process.argv[2];

let warPath: string;
if (localWar) {
  warPath = path.resolve(localWar);
  if (!fs.existsSync(warPath)) {
    console.error(`❌ Không thấy file ${warPath}`);
    process.exit(1);
  }
} else {
  console.log(`⬇️  Đang tải draw.io v${DRAWIO_VERSION} (~55 MB) từ GitHub...`);
  const res = await fetch(DOWNLOAD_URL);
  if (!res.ok) {
    console.error(`❌ Tải thất bại: HTTP ${res.status}. Tải tay ${DOWNLOAD_URL} rồi chạy: npm run install-drawio -- <đường dẫn draw.war>`);
    process.exit(1);
  }
  warPath = path.join(os.tmpdir(), `draw-${DRAWIO_VERSION}.war`);
  fs.writeFileSync(warPath, Buffer.from(await res.arrayBuffer()));
}

// Giải nén vào thư mục tạm, xong hết mới thay thư mục cũ -> lỗi giữa chừng
// không làm hỏng bản đang chạy.
const tmpDir = `${targetDir}.tmp`;
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

// Windows 10+ có sẵn tar.exe giải nén được .zip. Gọi đúng đường dẫn hệ
// thống, tránh nhầm sang tar của Git Bash (không đọc được .zip).
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
console.log('📦 Đang giải nén...');
execFileSync(tar, ['-xf', warPath, '-C', tmpDir], { stdio: 'inherit' });

if (!fs.existsSync(path.join(tmpDir, 'index.html'))) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error('❌ File không phải bộ draw.io hợp lệ (không có index.html)');
  process.exit(1);
}

// Phần chạy bằng Java trong .war — trang tĩnh không cần.
for (const sub of ['WEB-INF', 'META-INF']) fs.rmSync(path.join(tmpDir, sub), { recursive: true, force: true });

fs.rmSync(targetDir, { recursive: true, force: true });
fs.renameSync(tmpDir, targetDir);
if (!localWar) fs.rmSync(warPath, { force: true });

console.log(`✅ Đã cài draw.io vào ${targetDir}. Khởi động lại server để dùng khối "Sơ đồ".`);
