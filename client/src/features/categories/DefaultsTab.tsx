// ============================================================
// DefaultsTab — tab "Mục mặc định" trong Quản lý thể loại (admin)
// ============================================================
// Cây các mục MỌI bộ phận đều có (Quy trình, Biểu mẫu...). Tạo bộ phận mới
// (thể loại cấp cao nhất, không dùng chung) là tự có đủ cây này.
//   Thêm mục      -> hỏi "Thêm vào tất cả bộ phận?" (chỉ thêm chỗ còn thiếu)
//   Sửa / xóa mục -> chỉ đổi DANH SÁCH; thể loại đã có ở các bộ phận giữ nguyên
//                    (bên trong có thể đã có bài viết)
//   Đồng bộ       -> thêm mọi mục còn thiếu vào mọi bộ phận
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, RefreshCw, Save, Trash } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import type { Category } from '../../lib/types.ts';
import { errorMessage } from '../../lib/utils.ts';
import type { CategoryTemplate } from './api.ts';
import IconSelect from './IconSelect.tsx';
import ParentSelect from './ParentSelect.tsx';
import { useApplyDefaults, useDeleteTemplate, useSaveTemplate, useTemplates } from './queries.ts';
import { buildCategoryTree, flattenTree, subtreeIds, type CategoryNode } from './tree.ts';

// Mục mặc định có cùng hình dạng cây với thể loại -> mượn luôn hàm dựng cây / ô chọn cha.
const asCategories = (templates: CategoryTemplate[]): Category[] => templates.map((t) => ({ ...t, docCount: 0 }));

export default function DefaultsTab() {
  const { t } = useTranslation();
  const { data, isPending } = useTemplates();
  const categories = useMemo(() => asCategories(data ?? []), [data]);
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const apply = useApplyDefaults();

  const syncAll = () => {
    if (!window.confirm(t('categories.syncConfirm'))) return;
    apply.mutate(undefined, {
      onSuccess: (r) => toast.success(t('categories.syncDone', { count: r.created })),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('categories.defaultsHint')}</p>
        <Button variant="secondary" onClick={syncAll} loading={apply.isPending}>
          <RefreshCw className="h-4 w-4" /> {t('categories.sync')}
        </Button>
      </div>
      <NewTemplateForm tree={tree} />
      {isPending ? (
        <Spinner />
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {flattenTree(tree).map((node) => (
            <TemplateRow key={node.category.id} node={node} tree={tree} categories={categories} />
          ))}
        </ul>
      )}
    </>
  );
}

function NewTemplateForm({ tree }: { tree: CategoryNode[] }) {
  const { t } = useTranslation();
  const save = useSaveTemplate();
  const apply = useApplyDefaults();
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('Folder');
  const [parentId, setParentId] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { name, iconName, parentId: parentId || null },
      {
        onSuccess: (created) => {
          setName('');
          toast.success(t('categories.saved'));
          // Mục mới: hỏi có thêm ngay vào các bộ phận đang có không.
          if (window.confirm(t('categories.applyNewConfirm', { name: created.name }))) {
            apply.mutate(created.id, {
              onSuccess: (r) => toast.success(t('categories.syncDone', { count: r.created })),
              onError: (err) => toast.error(errorMessage(err)),
            });
          }
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <IconSelect value={iconName} onChange={setIconName} />
      <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('categories.newDefaultPlaceholder')} className="min-w-40 flex-1" />
      <ParentSelect tree={tree} value={parentId} onChange={setParentId} label={t('categories.defaultParent')} noParentLabel={t('categories.defaultRoot')} />
      <Button type="submit" loading={save.isPending || apply.isPending}>
        <Plus className="h-4 w-4" /> {t('common.add')}
      </Button>
    </form>
  );
}

function TemplateRow({ node, tree, categories }: { node: CategoryNode; tree: CategoryNode[]; categories: Category[] }) {
  const { t } = useTranslation();
  const { category: item } = node;
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const [name, setName] = useState(item.name);
  const [iconName, setIconName] = useState(item.iconName);
  const [parentId, setParentId] = useState(item.parentId ?? '');
  const changed = name !== item.name || iconName !== item.iconName || parentId !== (item.parentId ?? '');
  const exclude = useMemo(() => subtreeIds(categories, item.id), [categories, item.id]);

  const onSave = () =>
    save.mutate(
      { id: item.id, name, iconName, parentId: parentId || null },
      { onSuccess: () => toast.success(t('categories.saved')), onError: (err) => toast.error(errorMessage(err)) },
    );
  const onDelete = () => {
    if (!window.confirm(t('categories.deleteDefaultConfirm', { name: item.name }))) return;
    remove.mutate(item.id, { onSuccess: () => toast.success(t('categories.deleted')), onError: (err) => toast.error(errorMessage(err)) });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 p-3" style={{ paddingLeft: 12 + node.depth * 28 }}>
      {node.depth > 0 && <span className="text-muted">└</span>}
      <IconSelect value={iconName} onChange={setIconName} />
      <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-36 flex-1" aria-label={t('categories.name')} />
      <ParentSelect
        tree={tree}
        value={parentId}
        onChange={setParentId}
        exclude={exclude}
        label={t('categories.defaultParent')}
        noParentLabel={t('categories.defaultRoot')}
      />
      <Button size="sm" onClick={onSave} disabled={!changed || !name.trim()} loading={save.isPending}>
        <Save className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete} loading={remove.isPending} title={t('common.delete')}>
        <Trash className="h-4 w-4" />
      </Button>
    </li>
  );
}
