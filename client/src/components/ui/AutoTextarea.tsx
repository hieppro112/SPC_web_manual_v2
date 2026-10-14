// ============================================================
// AutoTextarea — ô nhập nhiều dòng TỰ CAO LÊN theo nội dung
// ============================================================
// Tài liệu dài có nhiều đoạn văn; ô nhập cố định 3 dòng thì phải cuộn
// bên trong từng ô, rất khó soạn. Ô này cao đúng bằng nội dung.

import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils.ts';
import { fieldClass } from './Input.tsx';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number };

function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto'; // thu về trước để đo đúng khi xóa bớt chữ
  el.style.height = `${el.scrollHeight + 2}px`;
}

export default function AutoTextarea({ className, minRows = 2, value, ...rest }: Props) {
  // useRef: giữ tham chiếu tới thẻ <textarea> thật trên trang để đo chiều cao.
  // 🔸 Flutter: giống GlobalKey để lấy RenderBox.
  const ref = useRef<HTMLTextAreaElement>(null);

  // useLayoutEffect chạy SAU khi React cập nhật DOM nhưng TRƯỚC khi trình
  // duyệt vẽ -> chỉnh chiều cao mà không bị giật hình.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) fitHeight(el);
  }, [value]);

  // Bề rộng đổi (thu nhỏ cửa sổ, khung chứa vừa mở xong...) thì số dòng chữ
  // cũng đổi -> đo lại. Chỉ phản ứng khi BỀ RỘNG đổi, vì chính fitHeight cũng
  // làm chiều cao đổi (tránh vòng lặp đo mãi).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth !== width) {
        width = el.offsetWidth;
        fitHeight(el);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={cn(fieldClass, 'resize-none overflow-hidden py-2 leading-relaxed', className)}
      {...rest}
    />
  );
}
