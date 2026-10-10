// ============================================================
// Popover — nút bấm mở ra một khung nổi (menu, danh sách chọn)
// ============================================================
//   <Popover trigger={(toggle) => <Button onClick={toggle}>Menu</Button>}>
//     {(close) => <button onClick={close}>Mục 1</button>}
//   </Popover>
// Bấm ra ngoài hoặc nhấn Esc thì đóng.
//
// `trigger` và `children` là HÀM nhận toggle/close — kiểu "render prop":
// component cha tự vẽ nút, Popover chỉ đưa cho nó hàm để mở/đóng.
// 🔸 Flutter: giống builder: (context, close) => ... trong PopupMenu.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils.ts';

type Props = {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
};

export default function Popover({ trigger, children, align = 'left', className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // Hàm "dọn dẹp": React gọi khi popover đóng hoặc component biến mất,
    // để gỡ listener — không gỡ thì listener tích tụ mỗi lần mở.
    // 🔸 Flutter: giống dispose().
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((o) => !o), open)}
      {open && (
        <div
          className={cn(
            'absolute top-full z-50 mt-1 min-w-48 rounded-xl border border-border bg-bg p-1 shadow-xl',
            { left: 'left-0', right: 'right-0', center: 'left-1/2 -translate-x-1/2' }[align],
            className,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
