// ============================================================
// CategoriesAdminPage — admin quản lý thể loại  (/admin/categories)
// ============================================================
// 3 tab:
//   Thể loại      thêm / sửa / xóa thể loại dạng cây. Mỗi thể loại chọn được
//                 "Thuộc thể loại" (cha). Danh sách thụt lề theo cấp:
//                   IT
//                      └ AI
//                   PC
//   Mục mặc định  các mục mọi bộ phận đều có (DefaultsTab.tsx)
//   Chờ duyệt     đề xuất thể loại của biên tập (RequestsReviewTab.tsx)

import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Save, Trash } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import type { Category } from '../../lib/types.ts';
import { cn, errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCompleteOnMount } from '../guide/queries.ts';
import DefaultsTab from './DefaultsTab.tsx';
import IconSelect from './IconSelect.tsx';
import ParentSelect from './ParentSelect.tsx';
import { useCategoryTree, useDeleteCategory, usePendingRequestCount, useSaveCategory } from './queries.ts';
import RequestsReviewTab from './RequestsReviewTab.tsx';
import { flattenTree, subtreeIds, type CategoryNode } from './tree.ts';

// 3 tab, tab đang mở nằm trên URL (?tab=defaults) -> F5 / gửi link vẫn mở đúng tab.
const TABS = ['categories', 'defaults', 'requests'] as const;
type Tab = (typeof TABS)[number];

export default function CategoriesAdminPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'categories';
  const pendingRequests = usePendingRequestCount(true);
  useDocumentTitle(t('categories.title'));
  useCompleteOnMount('adminCategories');

  return (
    <div className="mx-auto max-w-form px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">{t('categories.title')}</h1>
      <div className="mb-6 flex gap-1 border-b border-border" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'categories' ? {} : { tab: key }, { replace: true })}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t(`categories.tab.${key}`)}
            {key === 'requests' && pendingRequests > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{pendingRequests}</span>
            )}
          </button>
        ))}
      </div>
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'defaults' && <DefaultsTab />}
      {tab === 'requests' && <RequestsReviewTab />}
    </div>
  );
}

function CategoriesTab() {
  const { t } = useTranslation();
  const { tree, data: categories, isPending } = useCategoryTree();
  return (
    <>
      <NewCategoryForm tree={tree} />
      <p className="mt-2 text-xs text-muted">{t('categories.departmentHint')}</p>
      {isPending ? (
        <Spinner />
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {flattenTree(tree).map((node) => (
            // key = id: mỗi dòng giữ state chỉnh sửa riêng của nó.
            <CategoryRow key={node.category.id} node={node} tree={tree} categories={categories ?? []} />
          ))}
        </ul>
      )}
    </>
  );
}


// Ô "Dùng chung cho mọi bộ phận": thể loại (và con cháu) ai cũng xem được, kể cả khách.
function SharedCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-1.5 text-sm" title={t('categories.sharedHint')}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {t('categories.shared')}
    </label>
  );
}

function NewCategoryForm({ tree }: { tree: CategoryNode[] }) {
  const { t } = useTranslation();
  const save = useSaveCategory();
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('Folder');
  const [parentId, setParentId] = useState('');
  const [isShared, setIsShared] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { name, iconName, parentId: parentId || null, isShared },
      {
        onSuccess: (created) => {
          // Tạo bộ phận -> server đã thêm sẵn các mục mặc định, báo cho admin biết.
          toast.success(created.defaultsCreated ? t('categories.savedWithDefaults', { count: created.defaultsCreated }) : t('categories.saved'));
          setName('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <IconSelect value={iconName} onChange={setIconName} />
      <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('categories.newPlaceholder')} className="min-w-40 flex-1" />
      <ParentSelect tree={tree} value={parentId} onChange={setParentId} />
      <SharedCheckbox checked={isShared} onChange={setIsShared} />
      <Button type="submit" loading={save.isPending}>
        <Plus className="h-4 w-4" /> {t('common.add')}
      </Button>
    </form>
  );
}

function CategoryRow({ node, tree, categories }: { node: CategoryNode; tree: CategoryNode[]; categories: Category[] }) {
  const { t } = useTranslation();
  const { category } = node;
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState(category.name);
  const [iconName, setIconName] = useState(category.iconName);
  const [parentId, setParentId] = useState(category.parentId ?? '');
  const [isShared, setIsShared] = useState(!!category.isShared);
  const changed =
    name !== category.name || iconName !== category.iconName || parentId !== (category.parentId ?? '') || isShared !== !!category.isShared;

  // Không được chọn chính nó hoặc con cháu của nó làm cha (sẽ thành vòng lặp).
  const exclude = useMemo(() => subtreeIds(categories, category.id), [categories, category.id]);

  const onSave = () =>
    save.mutate(
      { id: category.id, name, iconName, parentId: parentId || null, isShared },
      { onSuccess: () => toast.success(t('categories.saved')), onError: (err) => toast.error(errorMessage(err)) },
    );

  const onDelete = () => {
    if (!window.confirm(t('categories.deleteConfirm', { name: category.name }))) return;
    remove.mutate(category.id, {
      onSuccess: () => toast.success(t('categories.deleted')),
      // Server trả 409 "Còn N thể loại con / tài liệu..." -> hiện nguyên câu đó.
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    // Thụt lề theo cấp + vạch bên trái để thấy rõ quan hệ cha-con
    <li className="flex flex-wrap items-center gap-3 p-3" style={{ paddingLeft: 12 + node.depth * 28 }}>
      {node.depth > 0 && <span className="text-muted">└</span>}
      <IconSelect value={iconName} onChange={setIconName} />
      <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-36 flex-1" aria-label={t('categories.name')} />
      <ParentSelect tree={tree} value={parentId} onChange={setParentId} exclude={exclude} />
      <SharedCheckbox checked={isShared} onChange={setIsShared} />
      <span className="w-20 text-sm text-muted">
        {category.docCount} {t('categories.docs').toLowerCase()}
      </span>
      <Button size="sm" onClick={onSave} disabled={!changed || !name.trim()} loading={save.isPending}>
        <Save className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete} loading={remove.isPending} title={t('common.delete')}>
        <Trash className="h-4 w-4" />
      </Button>
    </li>
  );
}
