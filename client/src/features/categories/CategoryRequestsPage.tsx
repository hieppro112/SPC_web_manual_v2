// ============================================================
// CategoryRequestsPage — Đề xuất thể loại (biên tập)  (/category-requests)
// ============================================================
// Biên tập cần thêm mục (vd "Biểu mẫu › Nhân sự") -> gửi đề xuất, admin duyệt.
// Đang chờ duyệt thì thể loại CHƯA có: không ai thấy, chưa đăng bài vào được.
// Chỉ chọn được thể loại cha trong phạm vi mình xem được (bộ phận của mình).
// Bên dưới: "Đề xuất của tôi" — chờ duyệt / đã duyệt / bị từ chối (kèm lý do).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FolderPlus, Send, Trash } from 'lucide-react';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { cn, errorMessage, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import type { CategoryRequest, RequestStatus } from './api.ts';
import CategoryIcon from './CategoryIcon.tsx';
import CategoryOptions from './CategoryOptions.tsx';
import IconSelect from './IconSelect.tsx';
import { useCancelRequest, useCategoryTree, useCreateRequest, useMyRequests } from './queries.ts';

export default function CategoryRequestsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('categories.requestTitle'));
  const mine = useMyRequests();

  return (
    <div className="mx-auto max-w-form space-y-8 px-4 py-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FolderPlus className="h-6 w-6 text-accent" /> {t('categories.requestTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('categories.requestHint')}</p>
      </header>
      <RequestForm />
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('categories.myRequests')}</h2>
        {mine.isPending ? (
          <Spinner />
        ) : !mine.data?.length ? (
          <p className="text-sm text-muted">{t('categories.noMyRequests')}</p>
        ) : (
          <ul className="space-y-3">
            {mine.data.map((r) => (
              <MyRequestRow key={r.id} request={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestForm() {
  const { t } = useTranslation();
  const { tree } = useCategoryTree();
  const create = useCreateRequest();
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('Folder');
  const [note, setNote] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { parentId, name, iconName, note },
      {
        onSuccess: () => {
          toast.success(t('categories.requestSent'));
          setName('');
          setNote('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <label className="block space-y-1 text-sm">
        <span className="text-muted">{t('categories.requestParent')}</span>
        <Select required value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="" disabled>
            {t('categories.chooseParent')}
          </option>
          <CategoryOptions tree={tree} />
        </Select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <IconSelect value={iconName} onChange={setIconName} />
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('categories.newPlaceholder')} className="min-w-40 flex-1" />
      </div>
      <AutoTextarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('categories.notePlaceholder')} maxLength={500} />
      <div className="flex justify-end">
        <Button type="submit" loading={create.isPending} disabled={!parentId || !name.trim()}>
          <Send className="h-4 w-4" /> {t('categories.sendRequest')}
        </Button>
      </div>
    </form>
  );
}

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: 'bg-warning-soft text-warning',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
};

function MyRequestRow({ request }: { request: CategoryRequest }) {
  const { t, i18n } = useTranslation();
  const cancel = useCancelRequest();
  const onCancel = () => {
    if (!window.confirm(t('categories.cancelRequestConfirm', { name: request.name }))) return;
    cancel.mutate(request.id, { onError: (err) => toast.error(errorMessage(err)) });
  };

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-2xl border border-border p-4">
      <CategoryIcon name={request.iconName} className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="font-medium">
          {request.status === 'approved' && request.categoryId ? (
            <Link to={`/?category=${request.categoryId}`} className="hover:text-accent">
              {request.parentPath} › {request.name}
            </Link>
          ) : (
            `${request.parentPath} › ${request.name}`
          )}
        </p>
        <p className="text-xs text-muted">{formatDateTime(request.createdAt, i18n.language)}</p>
        {request.status === 'rejected' && (
          <p className="text-danger">
            {t('categories.reason')}: {request.rejectReason || t('categories.noReason')}
          </p>
        )}
      </div>
      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[request.status])}>
        {t(`categories.requestStatus.${request.status}`)}
      </span>
      {request.status === 'pending' && (
        <Button size="sm" variant="ghost" className="text-danger" onClick={onCancel} loading={cancel.isPending} title={t('categories.cancelRequest')}>
          <Trash className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
