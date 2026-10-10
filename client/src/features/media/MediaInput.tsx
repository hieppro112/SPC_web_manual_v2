// ============================================================
// MediaInput — ô chọn ảnh / video / file dùng chung cho các khối
// ============================================================
// Một chỗ gom đủ mọi cách đưa file vào tài liệu:
//   • Chọn từ máy          • Kéo thả file vào khung
//   • Dán ảnh (Ctrl + V) — tiện cho ảnh chụp màn hình
//   • Thư viện media (file đã upload trước đó)
//   • Chụp/quay bằng điện thoại qua mã QR (ảnh, video)
//   • Dán URL
// Khối ảnh, video, file, bước... chỉ việc dùng <MediaInput kind="image" .../>.

import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileText, Library, Link2, QrCode, Upload, X } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import type { Media, MediaKind } from '../../lib/types.ts';
import { cn, errorMessage } from '../../lib/utils.ts';
import MediaLibraryDialog from './MediaLibraryDialog.tsx';
import QrUploadDialog from './QrUploadDialog.tsx';
import { useUploadMedia } from './queries.ts';

type Props = {
  kind: MediaKind;
  value: string;
  // media có giá trị khi chọn từ upload/thư viện/QR (biết tên, dung lượng);
  // undefined khi dán URL.
  onChange: (src: string, media?: Media) => void;
};

const ACCEPT: Record<MediaKind, string | undefined> = { image: 'image/*', video: 'video/*', file: undefined };

export default function MediaInput({ kind, value, onChange }: Props) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, progress } = useUploadMedia();
  const [urlDraft, setUrlDraft] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    // Khối ảnh mà chọn nhầm file PDF -> báo ngay, khỏi upload vô ích.
    if (kind !== 'file' && !file.type.startsWith(`${kind}/`)) {
      toast.error(t('media.uploadFailed'), { description: file.name });
      return;
    }
    try {
      const media = await upload(file);
      onChange(media.url, media);
    } catch (err) {
      toast.error(t('media.uploadFailed'), { description: errorMessage(err) });
    }
  };

  const pick = (media: Media) => {
    onChange(media.url, media);
    setLibraryOpen(false);
    setQrOpen(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const onPaste = (e: ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files)[0];
    if (file) {
      e.preventDefault();
      void handleFile(file);
    }
  };

  // Không đặt tên useUrl: tên bắt đầu bằng "use" bị React coi là hook.
  const applyUrl = () => {
    const url = urlDraft.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error(t('media.invalidUrl'));
      return;
    }
    onChange(url);
    setUrlDraft('');
  };

  // ---------- Đã có file: xem trước + nút Thay/Bỏ ----------
  if (value && progress === null) {
    return (
      <div className="space-y-2">
        <Preview kind={kind} src={value} />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => onChange('')}>
            <X className="h-4 w-4" /> {t('common.remove')}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Chưa có file: khung chọn ----------
  return (
    <div
      // tabIndex để khung nhận được focus -> bấm vào rồi Ctrl+V dán ảnh được.
      tabIndex={0}
      onPaste={onPaste}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'space-y-3 rounded-xl border-2 border-dashed p-4 transition-colors',
        dragging ? 'border-accent bg-accent-soft' : 'border-border',
      )}
    >
      {progress !== null ? (
        <div className="space-y-2 py-2">
          <p className="text-sm">{t('media.uploading', { percent: progress })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">{t('media.dropHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" /> {t('media.choose')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setLibraryOpen(true)}>
              <Library className="h-4 w-4" /> {t('media.library')}
            </Button>
            {kind !== 'file' && (
              <Button size="sm" variant="secondary" onClick={() => setQrOpen(true)}>
                <QrCode className="h-4 w-4" /> {t('media.qr')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyUrl();
                }
              }}
              placeholder={t('media.urlPlaceholder')}
              className="h-8"
            />
            <Button size="sm" variant="secondary" onClick={applyUrl} disabled={!urlDraft.trim()}>
              <Link2 className="h-4 w-4" /> {t('media.useUrl')}
            </Button>
          </div>
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT[kind]}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Xóa giá trị để chọn lại CÙNG một file vẫn kích hoạt onChange.
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      <MediaLibraryDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} kind={kind} onSelect={pick} />
      {kind !== 'file' && <QrUploadDialog open={qrOpen} onClose={() => setQrOpen(false)} kind={kind} onReceived={pick} />}
    </div>
  );
}

function Preview({ kind, src }: { kind: MediaKind; src: string }) {
  if (kind === 'image') return <img src={src} alt="" className="max-h-72 rounded-lg border border-border" />;
  if (kind === 'video') return <video src={src} controls preload="metadata" className="max-h-72 rounded-lg border border-border" />;
  return (
    <p className="flex items-center gap-2 break-all text-sm">
      <FileText className="h-4 w-4 shrink-0 text-muted" /> {src}
    </p>
  );
}
