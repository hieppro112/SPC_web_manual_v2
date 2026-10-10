// ============================================================
// CategoryNav — danh sách thể loại ở cột trái trang chủ
// ============================================================
// Thể loại đang chọn nằm trên URL (?category=...), không nằm trong state:
// bấm F5 hay gửi link cho người khác vẫn mở đúng thể loại đó.

import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Settings } from 'lucide-react';
import { cn } from '../../lib/utils.ts';
import { useCurrentUser } from '../auth/queries.ts';
import CategoryIcon from './CategoryIcon.tsx';
import { useCategories } from './queries.ts';

export default function CategoryNav() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: categories } = useCategories();
  const [params] = useSearchParams();
  const current = params.get('category');
  const total = categories?.reduce((sum, c) => sum + c.docCount, 0);

  const itemClass = (active: boolean) =>
    cn(
      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
      active ? 'bg-accent-soft font-medium text-accent' : 'text-fg hover:bg-surface-2',
    );

  return (
    <nav className="space-y-1">
      <div className="flex items-center justify-between px-3 pb-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t('home.categories')}</h2>
        {user?.role === 'admin' && (
          <Link to="/admin/categories" className="text-muted hover:text-accent" title={t('nav.categories')}>
            <Settings className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <Link to="/" className={itemClass(!current)}>
        <LayoutGrid className="h-4 w-4" />
        <span className="flex-1">{t('common.all')}</span>
        <span className="text-xs text-muted">{total}</span>
      </Link>
      {categories?.map((c) => (
        <Link key={c.id} to={`/?category=${c.id}`} className={itemClass(current === c.id)}>
          <CategoryIcon name={c.iconName} className="h-4 w-4" />
          <span className="flex-1 truncate">{c.name}</span>
          <span className="text-xs text-muted">{c.docCount}</span>
        </Link>
      ))}
      {categories?.length === 0 && <p className="px-3 text-sm text-muted">{t('home.noCategories')}</p>}
    </nav>
  );
}
