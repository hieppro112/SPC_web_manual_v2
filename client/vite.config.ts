// ============================================================
// vite.config.ts — Cấu hình công cụ build/dev server
// ============================================================
// File này chạy bằng Node (lúc gõ `npm run dev`), KHÔNG chạy trong
// trình duyệt. 🔸 Flutter: vai trò gần giống pubspec.yaml + cấu hình build.

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    // Mở dev server cho cả mạng LAN (không chỉ localhost), để điện thoại
    // quét QR mở được trang upload khi đang phát triển.
    host: true,

    // PROXY: React chỉ gọi '/api/...' và '/uploads/...' (cùng cổng 5173).
    // Vite chuyển tiếp sang Express ở cổng 5000. Trình duyệt tưởng mọi
    // thứ cùng một nguồn -> không cần CORS, cookie đăng nhập hoạt động.
    //   Trình duyệt ──/api/documents──▶ Vite :5173 ──▶ Express :5000
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
      '/drawio': 'http://localhost:5000',
    },
  },
});
