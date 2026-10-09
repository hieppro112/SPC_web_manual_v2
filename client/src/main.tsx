// ============================================================
// main.tsx — Điểm khởi động của ứng dụng React
// ============================================================
// 🔸 Flutter: đây chính là hàm main() { runApp(MyApp()); }

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // import CSS kiểu này = "nạp style này cho cả trang"
import App from './App.tsx';

// index.html có sẵn một thẻ <div id="root"></div> trống.
// createRoot() biến thẻ đó thành nơi React toàn quyền vẽ giao diện.
//
// Dấu `!` là cú pháp TypeScript, nghĩa: "tôi chắc chắn giá trị này
// không null". getElementById có thể trả về null nếu không tìm thấy,
// nhưng ta biết chắc index.html có #root.
// 🔸 Dart: y hệt toán tử `!` (null assertion) bạn vẫn dùng.
createRoot(document.getElementById('root')!).render(
  // StrictMode chỉ hoạt động lúc DEV: nó cố tình chạy một số thứ 2 lần
  // (component, effect) để lộ ra bug sớm. Nếu thấy console.log in 2 lần
  // thì đừng hoảng — đó là StrictMode, lên production sẽ chỉ còn 1 lần.
  <StrictMode>
    <App />
  </StrictMode>,
);
