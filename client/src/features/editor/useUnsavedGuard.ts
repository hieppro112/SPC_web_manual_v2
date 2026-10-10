// ============================================================
// useUnsavedGuard — hỏi lại trước khi rời trang khi còn thay đổi chưa lưu
// ============================================================
// Hai đường rời trang khác nhau, phải chặn cả hai:
//   1. Chuyển trang TRONG app (bấm link, nút Back) -> useBlocker của React Router
//   2. Đóng tab / F5 / gõ URL khác             -> sự kiện beforeunload của trình duyệt
//
// Trả về hàm `allowNextNavigation()`: gọi trước khi TỰ chuyển trang sau
// khi lưu xong (lúc đó state "đã lưu" có thể chưa kịp cập nhật).

import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

export function useUnsavedGuard(dirty: boolean, message: string) {
  const skipRef = useRef(false);

  // Hàm truyền vào useBlocker chạy ĐÚNG LÚC chuyển trang, nên đọc được giá
  // trị mới nhất của ref (khác với biến `dirty` của lần vẽ trước).
  const blocker = useBlocker(() => dirty && !skipRef.current);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Trình duyệt tự hiện hộp thoại chuẩn của nó (không cho tùy chỉnh chữ).
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return {
    allowNextNavigation: () => {
      skipRef.current = true;
    },
  };
}
