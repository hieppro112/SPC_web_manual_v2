// ============================================================
// MobileUploadPage — trang mở trên ĐIỆN THOẠI sau khi quét QR  (/m/upload/:token)
// ============================================================
// Không cần đăng nhập: token trong link là "vé" dùng một lần.
//
// <input type="file" accept="image/*" capture="environment"> mở thẳng
// camera sau của điện thoại — chạy được cả trên HTTP mạng nội bộ (khác với
// API camera getUserMedia bắt buộc HTTPS).

import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Camera, CircleCheck, ImageUp, LoaderCircle, OctagonAlert, Video } from 'lucide-react';
import { ApiError } from '../../lib/http.ts';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { mediaApi } from './api.ts';
import { useUploadMedia, useUploadSessionStatus } from './queries.ts';

export default function MobileUploadPage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const session = useUploadSessionStatus(token, false);
  const { upload, progress } = useUploadMedia((file, onProgress) => mediaApi.uploadToSession(token, file, onProgress));
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const pickerInput = useRef<HTMLInputElement>(null);
  const kind = session.data?.kind ?? 'image';
  useDocumentTitle(kind === 'image' ? t('mobile.title') : t('mobile.titleVideo'));

  const send = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      await upload(file);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? t('mobile.used') : errorMessage(err));
    }
  };

  let content;
  if (session.isPending) {
    content = <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-muted" />;
  } else if (session.error || !session.data) {
    content = <Message icon={OctagonAlert} tone="text-danger" title={t('mobile.invalid')} />;
  } else if (done || session.data.status === 'done') {
    content = done ? (
      <Message icon={CircleCheck} tone="text-success" title={t('mobile.success')} text={t('mobile.successHint')} />
    ) : (
      <Message icon={OctagonAlert} tone="text-warning" title={t('mobile.used')} />
    );
  } else if (progress !== null) {
    content = (
      <div className="space-y-3">
        <p className="text-center font-medium">{t('mobile.uploading', { percent: progress })}</p>
        <div className="h-3 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  } else {
    const accept = kind === 'image' ? 'image/*' : 'video/*';
    content = (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          className="flex w-full flex-col items-center gap-3 rounded-2xl bg-accent px-6 py-10 text-lg font-semibold text-accent-fg active:scale-[0.98]"
        >
          {kind === 'image' ? <Camera className="h-12 w-12" /> : <Video className="h-12 w-12" />}
          {kind === 'image' ? t('mobile.takePhoto') : t('mobile.recordVideo')}
        </button>
        <button
          type="button"
          onClick={() => pickerInput.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-6 py-4 font-medium"
        >
          <ImageUp className="h-5 w-5" /> {t('mobile.chooseExisting')}
        </button>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <input ref={cameraInput} type="file" accept={accept} capture="environment" hidden onChange={(e) => send(e.target.files?.[0])} />
        <input ref={pickerInput} type="file" accept={accept} hidden onChange={(e) => send(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg px-5 py-8">
      <h1 className="mb-8 text-center text-xl font-bold">{kind === 'image' ? t('mobile.title') : t('mobile.titleVideo')}</h1>
      <div className="mx-auto w-full max-w-sm">{content}</div>
    </div>
  );
}

function Message({ icon: Icon, tone, title, text }: { icon: typeof Camera; tone: string; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Icon className={`h-14 w-14 ${tone}`} />
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="text-sm text-muted">{text}</p>}
    </div>
  );
}
