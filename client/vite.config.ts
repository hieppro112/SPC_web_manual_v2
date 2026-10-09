// ============================================================
// vite.config.ts — Cấu hình công cụ build/dev server
// ============================================================
// File này chạy bằng Node (lúc bạn gõ `npm run dev`), KHÔNG chạy trong
// trình duyệt. Nó dạy Vite cách biến code .tsx thành thứ trình duyệt hiểu.
//
// 🔸 Flutter: vai trò gần giống pubspec.yaml + cấu hình build.

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// defineConfig() không làm gì lúc chạy, nó chỉ để TypeScript gợi ý
// đúng tên các option khi bạn gõ (autocomplete).
export default defineConfig({
  plugins: [
    // Dịch JSX + bật Fast Refresh (sửa code là giao diện cập nhật, state
    // giữ nguyên). 🔸 Flutter: chính là Hot Reload.
    react(),
    // Tailwind cài qua npm thay vì CDN như bản cũ: chỉ class nào bạn
    // thật sự dùng mới được đưa vào file CSS cuối, nên nhẹ hơn rất nhiều.
    tailwindcss(),
  ],

  server: {
    // PROXY — điểm khác lớn nhất so với bản cũ.
    //
    // Bản cũ: React gọi thẳng http://localhost:5000/api/... → khác cổng
    // nên trình duyệt coi là "khác nguồn" (cross-origin), backend phải mở
    // cors() cho mọi website, và URL backend phải nhớ ở phía client.
    //
    // Bản mới: React chỉ gọi '/api/...' (cùng cổng 5173). Dev server của
    // Vite thấy đường dẫn bắt đầu bằng /api thì chuyển tiếp sang cổng 5000.
    // Trình duyệt tưởng mọi thứ cùng một nguồn → không cần CORS nữa.
    //
    //   Trình duyệt ──/api/documents──▶ Vite :5173 ──▶ Express :5000
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
