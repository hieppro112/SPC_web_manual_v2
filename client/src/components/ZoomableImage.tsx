// ============================================================
// ZoomableImage — ảnh trong tài liệu, bấm vào để xem cỡ lớn
// ============================================================
// Ảnh quy trình (bảng điều khiển, chi tiết máy) thường cần nhìn rõ chi tiết.

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import Dialog from './ui/Dialog.tsx';
import { cn } from '../lib/utils.ts';

type Props = { src: string; alt: string; className?: string };

export default function ZoomableImage({ src, alt, className }: Props) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-muted">
        <ImageOff className="h-8 w-8" />
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={alt}
        // loading="lazy": tài liệu dài nhiều ảnh, chỉ tải ảnh khi cuộn tới gần.
        loading="lazy"
        onError={() => setBroken(true)}
        onClick={() => setOpen(true)}
        className={cn('max-h-[560px] w-auto max-w-full cursor-zoom-in rounded-xl border border-border', className)}
      />
      <Dialog open={open} onClose={() => setOpen(false)} title={alt || ' '} className="max-w-6xl">
        <img src={src} alt={alt} className="mx-auto max-h-[80vh] w-auto rounded-lg" />
      </Dialog>
    </>
  );
}
