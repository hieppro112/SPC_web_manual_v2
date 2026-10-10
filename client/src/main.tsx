// ============================================================
// main.tsx — Điểm khởi động của ứng dụng React
// ============================================================
// 🔸 Flutter: đây chính là hàm main() { runApp(MyApp()); }
//
// Thứ tự bọc (provider ngoài cùng dùng được ở mọi nơi bên trong):
//   QueryClientProvider  — cache dữ liệu API dùng chung (TanStack Query)
//     RouterProvider     — chọn trang theo URL
// 🔸 Flutter: giống ProviderScope bọc MaterialApp.router.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import './i18n/index.ts'; // khởi tạo đa ngôn ngữ TRƯỚC khi vẽ component nào
import './index.css';
import { router } from './app/router.tsx';
import { ApiError } from './lib/http.ts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dữ liệu coi là "còn mới" trong 30 giây: chuyển qua lại giữa các
      // trang không gọi lại API liên tục.
      staleTime: 30_000,
      // Lỗi 4xx (không có, không có quyền...) thử lại cũng vô ích -> không thử.
      // Lỗi mạng / 5xx thử lại tối đa 2 lần.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
