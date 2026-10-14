// ============================================================
// CategoriesAdminPage — admin thêm / sửa / xóa thể loại dạng cây  (/admin/categories)
// ============================================================
// Mỗi thể loại chọn được "Thuộc thể loại" (cha). Danh sách hiện theo thứ
// tự cây, thụt lề theo cấp:
//   IT
//      └ AI
//   PC

import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Save, Trash } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import type { Category } from '../../lib/types.ts';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import CategoryIcon from './CategoryIcon.tsx';
import CategoryOptions from './CategoryOptions.tsx';
import { CATEGORY_ICONS } from './icons.ts';
import { useCategoryTree, useDeleteCategory, useSaveCategory } from './queries.ts';
import { flattenTree, subtreeIds, type CategoryNode } from './tree.ts';

export default function CategoriesAdminPage() {
  const { t } = useTranslation();
  const { tree, data: categories, isPending } = useCategoryTree();
  useDocumentTitle(t('categories.title'));

  return (
    <div className="mx-auto max-w-form px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('categories.title')}</h1>
      <NewCategoryForm tree={tree} />
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
    </div>
  );
}

function IconSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <CategoryIcon name={value} className="h-5 w-5 shrink-0 text-accent" />
      <Select aria-label={t('categories.icon')} value={value} onChange={(e) => onChange(e.target.value)} className="w-36">
        {Object.keys(CATEGORY_ICONS).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </div>
  );
}

// Ô chọn thể loại cha. Giá trị '' = cấp cao nhất.
function ParentSelect({ tree, value, onChange, exclude }: { tree: CategoryNode[]; value: string; onChange: (v: string) => void; exclude?: Set<string> }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-muted">{t('categories.parent')}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-48">
        <option value="">{t('categories.noParent')}</option>
        <CategoryOptions tree={tree} exclude={exclude} />
      </Select>
    </label>
  );
}

function NewCategoryForm({ tree }: { tree: CategoryNode[] }) {
  const { t } = useTranslation();
  const save = useSaveCategory();
  const [name, setName] = useState('');
  const [iconName, setIconName] = useState('Folder');
  const [parentId, setParentId] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { name, iconName, parentId: parentId || null },
      {
        onSuccess: () => {
          toast.success(t('categories.saved'));
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
  const changed = name !== category.name || iconName !== category.iconName || parentId !== (category.parentId ?? '');

  // Không được chọn chính nó hoặc con cháu của nó làm cha (sẽ thành vòng lặp).
  const exclude = useMemo(() => subtreeIds(categories, category.id), [categories, category.id]);

  const onSave = () =>
    save.mutate(
      { id: category.id, name, iconName, parentId: parentId || null },
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
