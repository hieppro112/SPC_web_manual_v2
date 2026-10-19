// ============================================================
// TranslationBar — chọn ngôn ngữ đọc + trạng thái bản dịch (trang đọc tài liệu)
// ============================================================
//   [ Tiếng Việt (gốc) | English | 日本語 ]
//   🌐 Bản dịch máy từ Tiếng Việt · Xem bản gốc · Đã chỉnh tay bởi An     [Sửa bản dịch] [Dịch lại]
// Server chưa bật dịch (chưa tạo bảng 007) -> không hiện gì.

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Languages, LoaderCircle, Pencil, RefreshCw } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import { cn, errorMessage } from '../../lib/utils.ts';
import { LANGS, type Lang, type TranslationView } from './api.ts';
import { useRetranslate } from './queries.ts';

type Props = {
  view: TranslationView;
  docId: string;
  slug: string;
  editor: boolean;
  onChangeLang: (lang: Lang) => void;
};

export default function TranslationBar({ view, docId, slug, editor, onChangeLang }: Props) {
  const { t } = useTranslation();
  const retranslate = useRetranslate(docId);
  const langName = (l: Lang) => t(`quiz.languages.${l}`);
  const translated = view.status === 'ready' || view.status === 'partial';
  const waiting = view.job === 'pending' || view.job === 'processing';

  const askRetranslate = (confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    retranslate.mutate(undefined, {
      onSuccess: () => toast.success(t('translation.queued')),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <div className="no-print mb-6 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Languages className="h-4 w-4 text-muted" />
        <div className="flex rounded-lg border border-border p-0.5 text-sm" role="radiogroup" aria-label={t('translation.readIn')}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={view.lang === l}
              onClick={() => onChangeLang(l)}
              className={cn('rounded-md px-2.5 py-1', view.lang === l ? 'bg-surface-2 font-medium' : 'text-muted hover:text-fg')}
            >
              {langName(l)}
              {l === view.sourceLang && <span className="ml-1 text-xs text-muted">({t('translation.original')})</span>}
            </button>
          ))}
        </div>
      </div>

      {translated && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 text-sm',
            view.status === 'partial' ? 'border-warning/40 bg-warning-soft' : 'border-border bg-surface',
          )}
        >
          <span>
            🌐 {t('translation.machine', { lang: langName(view.sourceLang) })}{' '}
            <button type="button" onClick={() => onChangeLang(view.sourceLang)} className="text-accent hover:underline">
              {t('translation.viewOriginal')}
            </button>
            {view.editedBy && <span className="text-muted"> · {t('translation.editedBy', { name: view.editedBy })}</span>}
          </span>
          {view.status === 'partial' && <span className="text-muted">{t('translation.partial', { count: view.untranslated ?? 0 })}</span>}
          {editor && (
            <span className="ml-auto flex gap-1.5">
              <Link to={`/docs/${slug}/translate/${view.lang}`}>
                <Button size="sm" variant="secondary">
                  <Pencil className="h-3.5 w-3.5" /> {t('translation.edit')}
                </Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                loading={retranslate.isPending}
                disabled={waiting}
                onClick={() => askRetranslate(t('translation.retranslateConfirm'))}
                title={t('translation.retranslate')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </span>
          )}
        </div>
      )}

      {view.status === 'missing' && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
          {waiting && <LoaderCircle className="h-4 w-4 animate-spin text-accent" />}
          {waiting
            ? t('translation.waiting', { lang: langName(view.lang), source: langName(view.sourceLang) })
            : view.job === 'failed'
              ? t('translation.failed', { lang: langName(view.lang) })
              : t('translation.none', { lang: langName(view.lang) })}
          {editor && !waiting && (
            <Button size="sm" variant="secondary" className="ml-auto" loading={retranslate.isPending} onClick={() => askRetranslate()}>
              <RefreshCw className="h-3.5 w-3.5" /> {t('translation.translateNow')}
            </Button>
          )}
        </p>
      )}
    </div>
  );
}
