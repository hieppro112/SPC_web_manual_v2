// ParentSelect — ô chọn "cha" trong cây. Giá trị '' = cấp cao nhất.
// Dùng cho thể loại (Quản lý thể loại) và mục mặc định (nhãn riêng qua label / noParentLabel).
import { useTranslation } from 'react-i18next';
import Select from '../../components/ui/Select.tsx';
import CategoryOptions from './CategoryOptions.tsx';
import type { CategoryNode } from './tree.ts';

type Props = {
  tree: CategoryNode[];
  value: string;
  onChange: (v: string) => void;
  exclude?: Set<string>;
  label?: string;
  noParentLabel?: string;
};

export default function ParentSelect({ tree, value, onChange, exclude, label, noParentLabel }: Props) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-muted">{label ?? t('categories.parent')}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-48">
        <option value="">{noParentLabel ?? t('categories.noParent')}</option>
        <CategoryOptions tree={tree} exclude={exclude} />
      </Select>
    </label>
  );
}
