import { useTranslation } from 'react-i18next';
import { Download, FileText } from 'lucide-react';
import { formatBytes } from '../../lib/utils.ts';
import type { BlockViewProps } from '../types.ts';

export default function FileView({ props }: BlockViewProps<'file'>) {
  const { t } = useTranslation();
  if (!props.src) return null;

  return (
    <div className="avoid-break my-4 flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{props.name || props.src}</p>
        {props.size > 0 && <p className="text-xs text-muted">{formatBytes(props.size)}</p>}
      </div>
      {/* `download` đặt tên file khi lưu về (thay cho tên ngẫu nhiên trên server). */}
      <a
        href={props.src}
        download={props.name || true}
        className="no-print inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2"
      >
        <Download className="h-4 w-4" /> {t('common.download')}
      </a>
    </div>
  );
}
