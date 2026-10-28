// ============================================================
// CategoryNav — cây thể loại ở cột trái trang chủ
// ============================================================
//   Tất cả            12
//   ▾ IT               5     ← bấm ▾/▸ để thu gọn / mở rộng nhánh
//       AI             2
//     PC               3
//     QA               1
// Số đếm = tài liệu của CẢ nhánh (bấm "IT" cũng thấy tài liệu của "AI").
//
// Thể loại đang chọn nằm trên URL (?category=...), không nằm trong state:
// bấm F5 hay gửi link cho người khác vẫn mở đúng thể loại đó.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderPlus, LayoutGrid, Settings } from 'lucide-react';
import { cn } from '../../lib/utils.ts';
import { useCurrentUser } from '../auth/queries.ts';
import CategoryIcon from './CategoryIcon.tsx';
import { useCategoryTree } from './queries.ts';
import type { CategoryNode } from './tree.ts';

const itemClass = (active: boolean) =>
  cn(
    'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-2 pr-3 text-sm transition-colors',
    active ? 'bg-accent-soft font-medium text-accent' : 'text-fg hover:bg-surface-2',
  );

export default function CategoryNav() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { tree, data: categories } = useCategoryTree();
  const [params] = useSearchParams();
  const current = params.get('category');
  // Lưu nhánh nào đang THU GỌN (mặc định rỗng = mở hết, thấy ngay cả cây).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const total = tree.reduce((sum, node) => sum + node.totalCount, 0);

  // Tạo Set MỚI thay vì sửa Set cũ — React so sánh bằng tham chiếu.
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      <Link to="/" className={cn(itemClass(!current), 'pl-3')}>
        <LayoutGrid className="h-4 w-4" />
        <span className="flex-1">{t('common.all')}</span>
        <span className="text-xs text-muted">{total}</span>
      </Link>
      <TreeLevel nodes={tree} current={current} collapsed={collapsed} onToggle={toggle} />
      {categories?.length === 0 && <p className="px-3 text-sm text-muted">{t('home.noCategories')}</p>}
      {/* Thiếu mục? Biên tập gửi đề xuất (admin duyệt); người dùng thường liên hệ admin. */}
      {user?.role === 'editor' && (
        <Link to="/category-requests" className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-accent">
          <FolderPlus className="h-4 w-4" /> {t('nav.categoryRequests')}
        </Link>
      )}
      {user?.role === 'user' && <p className="mt-2 px-3 text-xs text-muted">{t('categories.contactAdmin')}</p>}
    </nav>
  );
}

type LevelProps = {
  nodes: CategoryNode[];
  current: string | null;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
};

// Vẽ một cấp của cây; nhánh nào đang mở thì gọi lại chính nó cho cấp con.
// (Component gọi lại chính nó = "đệ quy" — cây sâu bao nhiêu cấp cũng vẽ được.)
// 🔸 Flutter: giống một widget tự lồng chính nó trong children.
function TreeLevel({ nodes, current, collapsed, onToggle }: LevelProps) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const { category } = node;
        const hasChildren = node.children.length > 0;
        const open = !collapsed.has(category.id);
        return (
          <li key={category.id}>
            {/* Thụt lề theo cấp: mỗi cấp lùi vào 16px */}
            <div className="flex items-center" style={{ paddingLeft: node.depth * 16 }}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(category.id)}
                  aria-expanded={open}
                  title={open ? t('common.collapse') : t('common.expand')}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
                >
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <Link to={`/?category=${category.id}`} className={cn(itemClass(current === category.id), 'pl-1.5')}>
                <CategoryIcon name={category.iconName} className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{category.name}</span>
                <span className="text-xs text-muted">{node.totalCount}</span>
              </Link>
            </div>
            {hasChildren && open && (
              <TreeLevel nodes={node.children} current={current} collapsed={collapsed} onToggle={onToggle} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
