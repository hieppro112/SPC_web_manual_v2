// ============================================================
// ExistingQuizzes — báo "các bài đang chọn đã có đề nào chưa"
// ============================================================
//   ExistingPanel        khung nhỏ dưới phần chọn bài, đổi ngay mỗi lần tick thêm / bỏ bài
//   ConfirmExistingDialog hộp thoại hỏi lại trước khi tạo, nếu đã có đề dùng các bài này
// Cả hai dùng chung RelatedList (danh sách đề / yêu cầu liên quan) — luật tính ở existing.ts.

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleCheck, ExternalLink, LoaderCircle, TriangleAlert } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import Dialog from '../../components/ui/Dialog.tsx';
import { cn } from '../../lib/utils.ts';
import type { Related } from './existing.ts';

function RelatedList({ items, selectedCount, limit }: { items: Related[]; selectedCount: number; limit?: number }) {
  const { t } = useTranslation();
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-1.5">
      {shown.map((r) => (
        <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-bg px-2.5 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
          {r.exact ? (
            <Badge className="bg-danger-soft text-danger">{t('quiz.existing.exact')}</Badge>
          ) : (
            <Badge>{t('quiz.existing.shared', { shared: r.shared, total: selectedCount })}</Badge>
          )}
          {r.quiz && <Badge tone={r.quiz.status === 'draft' ? 'warning' : 'neutral'}>{t(`quiz.status.${r.quiz.status}`)}</Badge>}
          {r.job && (
            <Badge tone="accent">
              <LoaderCircle className="h-3 w-3 animate-spin" /> {t('quiz.existing.pendingJob')}
            </Badge>
          )}
          {/* Mở đề ở TAB MỚI: ở lại trang này thì không mất các bài đã chọn. */}
          {r.quiz && (
            <Link to={`/quizzes/${r.id}/edit`} target="_blank" rel="noopener" title={t('quiz.existing.openNewTab')} className="text-muted hover:text-accent">
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </li>
      ))}
      {limit && items.length > limit && <li className="px-2.5 text-xs text-muted">{t('quiz.existing.more', { count: items.length - limit })}</li>}
    </ul>
  );
}

export function ExistingPanel({ items, selectedCount, loading }: { items: Related[]; selectedCount: number; loading: boolean }) {
  const { t } = useTranslation();
  if (!selectedCount) return null;
  if (loading) return <p className="text-xs text-muted">{t('quiz.existing.checking')}</p>;
  const exactCount = items.filter((r) => r.exact).length;
  return (
    <div
      aria-live="polite"
      className={cn('rounded-xl border px-3 py-2.5', items.length ? 'border-warning/40 bg-warning-soft/40' : 'border-success/30 bg-success-soft/40')}
    >
      {items.length ? (
        <>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-warning">
            <TriangleAlert className="h-4 w-4" />
            {exactCount ? t('quiz.existing.panelExact', { count: exactCount }) : t('quiz.existing.panelSome', { count: items.length })}
          </p>
          <RelatedList items={items} selectedCount={selectedCount} limit={4} />
        </>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="h-4 w-4" /> {t('quiz.existing.panelNone')}
        </p>
      )}
    </div>
  );
}

type DialogProps = { open: boolean; items: Related[]; selectedCount: number; onCancel: () => void; onConfirm: () => void };

export function ConfirmExistingDialog({ open, items, selectedCount, onCancel, onConfirm }: DialogProps) {
  const { t } = useTranslation();
  const exactCount = items.filter((r) => r.exact).length;
  return (
    <Dialog open={open} onClose={onCancel} title={t('quiz.existing.confirmTitle')}>
      <p className="mb-2 text-sm text-muted">{t('quiz.existing.confirmBody')}</p>
      {exactCount > 0 && <p className="mb-2 text-sm font-medium text-danger">{t('quiz.existing.panelExact', { count: exactCount })}</p>}
      <div className="mb-4 max-h-72 overflow-y-auto rounded-xl bg-surface p-2">
        <RelatedList items={items} selectedCount={selectedCount} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onConfirm}>{t('quiz.existing.confirmContinue')}</Button>
      </div>
    </Dialog>
  );
}
