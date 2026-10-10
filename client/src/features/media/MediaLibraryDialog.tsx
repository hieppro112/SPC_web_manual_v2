// MediaLibraryDialog — chọn lại ảnh/video/file đã upload trước đó.
import { useTranslation } from 'react-i18next';
import { FileText, Video } from 'lucide-react';
import Dialog from '../../components/ui/Dialog.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import type { Media, MediaKind } from '../../lib/types.ts';
import { formatBytes } from '../../lib/utils.ts';
import { useMediaLibrary } from './queries.ts';

type Props = { open: boolean; onClose: () => void; kind: MediaKind; onSelect: (media: Media) => void };

export default function MediaLibraryDialog({ open, onClose, kind, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t('media.libraryTitle')} className="max-w-3xl">
      <LibraryGrid kind={kind} onSelect={onSelect} />
    </Dialog>
  );
}

function LibraryGrid({ kind, onSelect }: Pick<Props, 'kind' | 'onSelect'>) {
  const { t } = useTranslation();
  const { data, isPending } = useMediaLibrary(kind);

  if (isPending) return <Spinner />;
  if (!data?.length) return <p className="py-10 text-center text-sm text-muted">{t('media.libraryEmpty')}</p>;

  return (
    <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
      {data.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(m)}
          className="group overflow-hidden rounded-xl border border-border text-left hover:border-accent"
        >
          <div className="flex aspect-video items-center justify-center bg-surface-2">
            {m.kind === 'image' ? (
              <img src={m.url} alt={m.originalName} loading="lazy" className="h-full w-full object-cover" />
            ) : m.kind === 'video' ? (
              <Video className="h-8 w-8 text-muted" />
            ) : (
              <FileText className="h-8 w-8 text-muted" />
            )}
          </div>
          <div className="p-2">
            <p className="truncate text-xs font-medium">{m.originalName || m.url}</p>
            <p className="text-xs text-muted">{formatBytes(m.size)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
