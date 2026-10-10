// ============================================================
// Dialog — hộp thoại dùng chung, dựa trên thẻ <dialog> có sẵn của trình duyệt
// ============================================================
// <dialog> + showModal() cho sẵn: lớp nền mờ, bấm Esc để đóng, khóa
// focus bên trong hộp thoại (người dùng bàn phím không Tab ra ngoài được).
//   <Dialog open={open} onClose={() => setOpen(false)} title="...">nội dung</Dialog>
// 🔸 Flutter: giống showDialog(), nhưng mở/đóng điều khiển bằng state `open`.

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function Dialog({ open, onClose, title, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  // Đồng bộ state `open` (React) với trạng thái thật của thẻ <dialog> (DOM).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Esc hoặc dialog.close() đều phát sự kiện "close" -> báo lên cha.
      onClose={onClose}
      // Bấm ra vùng nền mờ (chính thẻ dialog, không phải nội dung) thì đóng.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-bg p-0 text-fg shadow-2xl backdrop:bg-black/50',
        className,
      )}
    >
      {/* Chỉ vẽ nội dung khi mở: hộp thoại đóng thì không chạy query bên trong. */}
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
