// ============================================================
// HistoryPage — lịch sử phiên bản  (/docs/:slug/history)
// ============================================================
// Trái: danh sách phiên bản (mới nhất trên cùng). Phải: xem trước nội dung
// phiên bản đang chọn, dùng lại đúng DocContent của trang đọc.

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { computeBlockMeta } from '../../blocks/meta.ts';
import { withDefaults } from '../../blocks/registry.ts';
import { cn, errorMessage, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import DocContent from './DocContent.tsx';
import { useDocument, useRestoreVersion, useVersion, useVersions } from './queries.ts';

export default function HistoryPage() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const doc = useDocument(slug);
  const versions = useVersions(doc.data?.id);
  const [picked, setPicked] = useState<number | null>(null);
  // Chưa chọn gì thì mặc định xem bản mới nhất.
  const selected = picked ?? versions.data?.[0]?.version ?? null;
  const version = useVersion(doc.data?.id, selected);
  const restore = useRestoreVersion();
  useDocumentTitle(doc.data ? `${t('history.title')} — ${doc.data.title}` : undefined);

  const blocks = useMemo(() => version.data?.blocks.map(withDefaults) ?? [], [version.data]);
  const { meta } = useMemo(() => computeBlockMeta(blocks), [blocks]);

  if (doc.isPending || versions.isPending) return <Spinner className="py-24" />;
  if (!doc.data) return <p className="p-8 text-center text-danger">{errorMessage(doc.error)}</p>;
  const current = doc.data;

  const handleRestore = () => {
    if (selected === null || !window.confirm(t('history.restoreConfirm', { n: selected }))) return;
    restore.mutate(
      { id: current.id, version: selected },
      {
        onSuccess: (updated) => {
          toast.success(t('history.restored', { n: selected }));
          setPicked(updated.version);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <div className="mx-auto max-w-page px-4 lg:px-8 py-6 lg:py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link to={`/docs/${current.slug}`} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title={t('history.backToDoc')}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{t('history.title')}</h1>
          <p className="text-sm text-muted">{current.title}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ul className="space-y-1 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          {versions.data?.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setPicked(v.version)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2.5 text-left',
                  selected === v.version ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">v{v.version}</span>
                  {v.version === current.version && <Badge tone="accent">{t('history.current')}</Badge>}
                  {v.restoredFrom !== null && <Badge>{t('history.restoredFrom', { n: v.restoredFrom })}</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDateTime(v.createdAt, i18n.language)} · {v.savedBy?.displayName ?? '—'}
                </p>
                <p className="mt-0.5 truncate text-xs">{v.title}</p>
              </button>
            </li>
          ))}
        </ul>

        <section className="min-w-0 rounded-2xl border border-border p-5 md:p-8">
          {selected === null ? (
            <p className="text-muted">{t('history.select')}</p>
          ) : version.isPending ? (
            <Spinner />
          ) : version.data ? (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="text-sm text-muted">v{version.data.version}</p>
                  <h2 className="text-2xl font-bold">{version.data.title}</h2>
                </div>
                {version.data.version !== current.version && (
                  <Button onClick={handleRestore} loading={restore.isPending}>
                    <RotateCcw className="h-4 w-4" /> {t('history.restore')}
                  </Button>
                )}
              </div>
              <DocContent blocks={blocks} meta={meta} />
            </>
          ) : (
            <p className="text-danger">{errorMessage(version.error)}</p>
          )}
        </section>
      </div>
    </div>
  );
}
