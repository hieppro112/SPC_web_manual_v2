// ============================================================
// ShareDialog — link + mã QR của tài liệu
// ============================================================
// Tài liệu quy trình hay được mở ngay tại máy móc: in mã QR dán lên máy,
// công nhân quét bằng điện thoại là mở đúng hướng dẫn.

import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Download } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Dialog from '../../components/ui/Dialog.tsx';
import Input from '../../components/ui/Input.tsx';
import { copyText } from '../../lib/utils.ts';
import { publicBaseUrls } from '../media/publicBase.ts';
import { useServerMeta } from '../media/queries.ts';

type Props = { open: boolean; onClose: () => void; slug: string; title: string };

export default function ShareDialog({ open, onClose, slug, title }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t('share.title')}>
      <ShareBody slug={slug} title={title} />
    </Dialog>
  );
}

function ShareBody({ slug, title }: Pick<Props, 'slug' | 'title'>) {
  const { t } = useTranslation();
  const { data: meta } = useServerMeta();
  // Dùng địa chỉ người khác mở được (không phải localhost).
  const url = `${publicBaseUrls(meta)[0]}/docs/${slug}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const copy = async () => {
    if (await copyText(url)) toast.success(t('common.copied'));
  };

  const downloadQr = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-${slug}.png`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t('share.link')}</span>
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.target.select()} />
          <Button variant="secondary" onClick={copy}>
            <Copy className="h-4 w-4" /> {t('common.copy')}
          </Button>
        </div>
      </label>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-4">
        <div className="rounded-lg bg-white p-3">
          <QRCodeCanvas ref={canvasRef} value={url} size={200} marginSize={2} title={title} />
        </div>
        <p className="text-center text-sm text-muted">{t('share.qrHint')}</p>
        <Button variant="secondary" size="sm" onClick={downloadQr}>
          <Download className="h-4 w-4" /> {t('share.downloadQr')}
        </Button>
      </div>
    </div>
  );
}
