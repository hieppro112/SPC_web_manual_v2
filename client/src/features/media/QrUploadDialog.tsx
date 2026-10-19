// ============================================================
// QrUploadDialog — hiện mã QR, chờ điện thoại chụp ảnh/quay video gửi lên
// ============================================================
//   mở hộp thoại -> tạo phiên (token) -> vẽ QR chứa link /m/upload/<token>
//   -> hỏi server mỗi 2 giây -> điện thoại gửi xong -> onReceived(media)

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { CircleCheck, LoaderCircle, RotateCcw, Wifi } from 'lucide-react';
import Dialog from '../../components/ui/Dialog.tsx';
import Button from '../../components/ui/Button.tsx';
import Select from '../../components/ui/Select.tsx';
import type { Media } from '../../lib/types.ts';
import { errorMessage } from '../../lib/utils.ts';
import { useCompleteTask } from '../guide/queries.ts';
import { publicBaseUrls } from './publicBase.ts';
import { useNewUploadSession, useServerMeta, useUploadSessionStatus } from './queries.ts';

type Props = {
  open: boolean;
  onClose: () => void;
  kind: 'image' | 'video';
  onReceived: (media: Media) => void;
};

export default function QrUploadDialog({ open, onClose, kind, onReceived }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t('qr.title')}>
      {/* Tách phần thân ra component riêng: hộp thoại đóng là phần thân bị
          gỡ hẳn -> dừng polling, mở lại thì tạo phiên mới sạch sẽ. */}
      <QrUploadBody kind={kind} onReceived={onReceived} />
    </Dialog>
  );
}

function QrUploadBody({ kind, onReceived }: Pick<Props, 'kind' | 'onReceived'>) {
  const { t } = useTranslation();
  const complete = useCompleteTask();
  const [nonce, setNonce] = useState(0);
  const session = useNewUploadSession(kind, nonce);
  const meta = useServerMeta();
  const bases = publicBaseUrls(meta.data);
  const [baseIndex, setBaseIndex] = useState(0);

  const token = session.data?.token;
  const expiresAt = session.data ? new Date(session.data.expiresAt).getTime() : 0;
  const now = useNow();
  const secondsLeft = Math.max(0, Math.round((expiresAt - now) / 1000));
  const expired = !!session.data && secondsLeft === 0;

  const status = useUploadSessionStatus(token, !expired);
  const received = status.data?.status === 'done' ? status.data.media : null;

  // Báo lên cha ĐÚNG MỘT LẦN khi nhận được file. useRef nhớ "đã báo chưa"
  // mà không gây vẽ lại (khác useState).
  const reported = useRef(false);
  useEffect(() => {
    if (received && !reported.current) {
      reported.current = true;
      onReceived(received);
      complete('phoneUpload');
    }
  }, [received, onReceived, complete]);

  if (session.isPending || meta.isPending) {
    return <LoaderCircle className="mx-auto my-16 h-6 w-6 animate-spin text-muted" />;
  }
  if (session.error) return <p className="text-sm text-danger">{errorMessage(session.error)}</p>;

  const url = `${bases[Math.min(baseIndex, bases.length - 1)]}/m/upload/${token}`;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted">{kind === 'image' ? t('qr.scanHint') : t('qr.scanHintVideo')}</p>

      <div className="relative mx-auto w-fit rounded-xl bg-white p-4">
        <QRCodeSVG value={url} size={220} />
        {(expired || received) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/95 text-slate-900">
            {received ? (
              <>
                <CircleCheck className="h-12 w-12 text-green-600" />
                <span className="font-medium">{t('qr.received')}</span>
              </>
            ) : (
              <>
                <span className="font-medium">{t('qr.expired')}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    reported.current = false;
                    setNonce((n) => n + 1);
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> {t('qr.newCode')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!expired && !received && (
        <p className="flex items-center justify-center gap-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          {t('qr.waiting')} · {t('qr.expiresIn', { time: `${minutes}:${seconds}` })}
        </p>
      )}

      {/* Máy chủ có nhiều card mạng (LAN dây, Wi-Fi, VPN) thì cho chọn
          địa chỉ mà điện thoại vào được. */}
      {bases.length > 1 ? (
        <label className="block text-left text-xs text-muted">
          {t('qr.address')}
          <Select value={baseIndex} onChange={(e) => setBaseIndex(Number(e.target.value))} className="mt-1 h-9">
            {bases.map((b, i) => (
              <option key={b} value={i}>
                {b}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <p className="break-all font-mono text-xs text-muted">{url}</p>
      )}

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
        <Wifi className="h-3.5 w-3.5" /> {t('qr.networkHint')}
      </p>
    </div>
  );
}

// Thời gian hiện tại, cập nhật mỗi giây (cho đồng hồ đếm ngược).
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
