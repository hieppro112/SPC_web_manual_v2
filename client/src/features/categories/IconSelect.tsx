// IconSelect — chọn icon cho thể loại / mục mặc định / đề xuất (xem trước icon bên trái).
import { useTranslation } from 'react-i18next';
import Select from '../../components/ui/Select.tsx';
import CategoryIcon from './CategoryIcon.tsx';
import { CATEGORY_ICONS } from './icons.ts';

export default function IconSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
