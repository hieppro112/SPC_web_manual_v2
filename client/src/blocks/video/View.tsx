// Video: trên màn hình là trình phát; khi IN ra giấy/PDF (video không in
// được) thì thay bằng mã QR dẫn tới video — quét bằng điện thoại để xem.
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { absoluteUrl } from '../../lib/utils.ts';
import type { BlockViewProps } from '../types.ts';

export default function VideoView({ props }: BlockViewProps<'video'>) {
  const { t } = useTranslation();
  if (!props.src) return null;

  return (
    <figure className="avoid-break my-6">
      <video
        src={props.src}
        controls
        // metadata: chỉ tải thông tin (thời lượng, khung đầu), chưa tải cả
        // video cho tới khi người đọc bấm play — tài liệu nhiều video vẫn nhẹ.
        preload="metadata"
        // playsInline: iPhone không tự bật toàn màn hình khi phát.
        playsInline
        className="no-print mx-auto max-h-[560px] w-full rounded-xl border border-border bg-black"
      />
      <div className="print-only">
        <div className="flex items-center gap-4 rounded-xl border border-border p-3">
          <QRCodeSVG value={absoluteUrl(props.src)} size={96} />
          <div className="text-sm">
            <p className="font-medium">{t('blocks.video.printHint')}</p>
            <p className="break-all text-muted">{absoluteUrl(props.src)}</p>
          </div>
        </div>
      </div>
      {props.caption && <figcaption className="mt-2 text-center text-sm text-muted">{props.caption}</figcaption>}
    </figure>
  );
}
