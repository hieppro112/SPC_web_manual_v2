// ============================================================
// RequestsReviewTab — tab "Chờ duyệt" trong Quản lý thể loại (admin)
// ============================================================
// Biên tập đề xuất thể loại mới trong bộ phận của mình. Admin:
//   Duyệt   -> sửa tên / icon nếu cần rồi bấm Duyệt: thể loại được tạo ngay
//   Từ chối -> lý do (có thể bỏ trống), người đề xuất thấy trong "Đề xuất của tôi"
// Đổi qua "Đã duyệt" / "Đã từ chối" để xem lịch sử.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Inbox, X } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { cn, errorMessage, formatDateTime } from '../../lib/utils.ts';
import type { CategoryRequest, RequestStatus } from './api.ts';
import CategoryIcon from './CategoryIcon.tsx';
import IconSelect from './IconSelect.tsx';
import { useApproveRequest, useRejectRequest, useRequests } from './queries.ts';

const STATUSES: RequestStatus[] = ['pending', 'approved', 'rejected'];

export default function RequestsReviewTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RequestStatus>('pending');
  const { data, isPending, error } = useRequests(status);

  return (
    <>
      <div className="mb-4 flex rounded-lg border border-border p-0.5 sm:w-fit" role="group">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn('flex-1 rounded-md px-3 py-1 text-sm', status === s ? 'bg-surface-2 font-medium' : 'text-muted hover:text-fg')}
          >
            {t(`categories.requestStatus.${s}`)}
          </button>
        ))}
      </div>
      {isPending ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-danger">{errorMessage(error)}</p>
      ) : !data.length ? (
        <EmptyState icon={Inbox} title={t('categories.noRequests')} />
      ) : (
        <ul className="space-y-3">
          {data.map((r) => (status === 'pending' ? <PendingCard key={r.id} request={r} /> : <ProcessedRow key={r.id} request={r} />))}
        </ul>
      )}
    </>
  );
}

// Ai đề xuất, lúc nào, nằm trong thể loại nào, ghi chú gì.
function RequestInfo({ request }: { request: CategoryRequest }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted">
        {t('categories.requestedBy', { name: request.requestedBy.displayName, date: formatDateTime(request.createdAt, i18n.language) })}
      </p>
      <p>
        <span className="text-muted">{t('categories.requestParent')}: </span>
        <span className="font-medium">{request.parentPath}</span>
      </p>
      {request.note && <p className="rounded-lg bg-surface-2 px-3 py-2 whitespace-pre-wrap">{request.note}</p>}
    </div>
  );
}

function PendingCard({ request }: { request: CategoryRequest }) {
  const { t } = useTranslation();
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  // Admin sửa được tên / icon trước khi duyệt.
  const [name, setName] = useState(request.name);
  const [iconName, setIconName] = useState(request.iconName);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const onApprove = () =>
    approve.mutate(
      { id: request.id, name, iconName },
      { onSuccess: () => toast.success(t('categories.approved', { name })), onError: (err) => toast.error(errorMessage(err)) },
    );
  const onReject = () =>
    reject.mutate(
      { id: request.id, reason },
      { onSuccess: () => toast.success(t('categories.rejected')), onError: (err) => toast.error(errorMessage(err)) },
    );

  return (
    <li className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <IconSelect value={iconName} onChange={setIconName} />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-40 flex-1" aria-label={t('categories.name')} />
      </div>
      <RequestInfo request={request} />
      {rejecting ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('categories.rejectReasonPlaceholder')}
            className="min-w-48 flex-1"
          />
          <Button variant="danger" size="sm" onClick={onReject} loading={reject.isPending}>
            {t('categories.confirmReject')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRejecting(true)}>
            <X className="h-4 w-4" /> {t('categories.reject')}
          </Button>
          <Button size="sm" onClick={onApprove} disabled={!name.trim()} loading={approve.isPending}>
            <Check className="h-4 w-4" /> {t('categories.approve')}
          </Button>
        </div>
      )}
    </li>
  );
}

function ProcessedRow({ request }: { request: CategoryRequest }) {
  const { t, i18n } = useTranslation();
  return (
    <li className="space-y-2 rounded-2xl border border-border p-4">
      <p className="flex items-center gap-2 font-medium">
        <CategoryIcon name={request.iconName} className="h-4 w-4 text-accent" /> {request.name}
      </p>
      <RequestInfo request={request} />
      <p className="text-xs text-muted">
        {t('categories.reviewedBy', {
          name: request.reviewedBy ?? '—',
          date: request.reviewedAt ? formatDateTime(request.reviewedAt, i18n.language) : '—',
        })}
        {request.rejectReason && ` · ${t('categories.reason')}: ${request.rejectReason}`}
      </p>
    </li>
  );
}
