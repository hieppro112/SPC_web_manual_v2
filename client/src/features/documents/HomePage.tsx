// ============================================================
// HomePage — danh sách tài liệu (lọc theo thể loại, tìm kiếm, trạng thái)
// ============================================================
// Mọi bộ lọc đều nằm trên URL: /?category=...&q=...&status=draft
// -> bấm F5, nút Back, gửi link cho đồng nghiệp đều giữ nguyên bộ lọc.
// 🔸 Flutter: giống đưa tham số vào route của go_router thay vì giữ trong State.

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FilePlus2, FileSearch, FolderOpen, LayoutGrid, List } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Select from '../../components/ui/Select.tsx';
import SearchBox from '../../components/SearchBox.tsx';
import { isEditor, type DocStatus } from '../../lib/types.ts';
import { cn, errorMessage, storage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCurrentUser } from '../auth/queries.ts';
import CategoryNav from '../categories/CategoryNav.tsx';
import { useCategories } from '../categories/queries.ts';
import { useCompleteTask } from '../guide/queries.ts';
import { categoryPath } from '../categories/tree.ts';
import DocCard, { DocCardSkeleton, DocRow } from './DocCard.tsx';
import FeaturedSection from './FeaturedSection.tsx';
import { useDocuments } from './queries.ts';

const STATUS_FILTERS: (DocStatus | '')[] = ['', 'published', 'draft'];
type HomeView = 'grid' | 'list';
const VIEW_KEY = 'home.view';
// Ít bài quá thì khu "Nổi bật" chỉ lặp lại đúng mấy bài bên dưới -> không hiện.
const FEATURED_MIN_DOCS = 4;
const VIEW_OPTIONS = [
  { value: 'grid', icon: LayoutGrid, label: 'home.viewGrid' },
  { value: 'list', icon: List, label: 'home.viewList' },
] as const;

export default function HomePage() {
  const { t } = useTranslation();
  // Lọc nháp / tạo tài liệu: chỉ người soạn (role "user" chỉ thấy bài đã xuất bản).
  const editor = isEditor(useCurrentUser());
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const statusParam = params.get('status');
  const status = statusParam === 'draft' || statusParam === 'published' ? statusParam : undefined;
  // Sắp xếp: mới cập nhật (mặc định) / xem nhiều nhất / được thích nhiều nhất — cũng nằm trên URL.
  const sortParam = params.get('sort');
  const sort = sortParam === 'views' || sortParam === 'likes' ? sortParam : '';

  const { data: categories } = useCategories();
  const { data: docs, isPending, error, refetch } = useDocuments({ q, category, status, sort: sort || undefined });
  const categoryName = categories?.find((c) => c.id === category)?.name;
  // Các thể loại cha của thể loại đang chọn (AI -> [IT]) để hiện "IT ›" phía trên tiêu đề.
  const parents = categoryPath(categories ?? [], category).slice(0, -1);
  const heading = q ? t('home.searchResults', { q }) : (categoryName ?? t('home.allDocs'));
  useDocumentTitle(categoryName);

  // Nhiệm vụ thực hành: đã thử tìm kiếm / lọc theo thể loại.
  const complete = useCompleteTask();
  useEffect(() => {
    if (q) complete('search');
  }, [q, complete]);
  useEffect(() => {
    if (category) complete('category');
  }, [category, complete]);

  // Đổi một tham số trên URL (giữ nguyên các tham số khác). '' = bỏ tham số.
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };
  const setStatus = (value: string) => setParam('status', value);

  // Kiểu hiển thị lưới / danh sách: sở thích riêng mỗi người -> nhớ trong trình duyệt (không cần lên URL).
  const [view, setViewState] = useState<HomeView>(() => (storage.get(VIEW_KEY) === 'list' ? 'list' : 'grid'));
  const setView = (v: HomeView) => {
    setViewState(v);
    storage.set(VIEW_KEY, v);
  };
  // Khu "Nổi bật" chỉ ở trang chủ gốc: đang tìm / lọc / sắp xếp thì người dùng đang muốn thứ khác.
  const showFeatured = !q && !category && !status && !sort && (docs?.length ?? 0) >= FEATURED_MIN_DOCS;

  return (
    <div className="mx-auto max-w-page px-4 py-6 lg:px-8 md:grid md:grid-cols-[220px_1fr] md:gap-8 md:py-8">
      <aside className="mb-6 md:mb-0">
        {/* Điện thoại: thu gọn danh sách thể loại vào một mục bấm mở. */}
        <details data-tour="categories" className="rounded-xl border border-border p-2 md:hidden">
          <summary className="cursor-pointer px-2 py-1 text-sm font-medium">{categoryName ?? t('home.categories')}</summary>
          <div className="mt-2">
            <CategoryNav />
          </div>
        </details>
        <div data-tour="categories" className="sticky top-20 hidden md:block">
          <CategoryNav />
        </div>
      </aside>

      <main className="min-w-0">
        <SearchBox className="mb-4 md:hidden" />
        {showFeatured && <FeaturedSection />}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            {!q && parents.length > 0 && (
              <nav className="mb-1 flex flex-wrap items-center gap-1 text-sm text-muted">
                {parents.map((p) => (
                  <span key={p.id} className="flex items-center gap-1">
                    <Link to={`/?category=${p.id}`} className="hover:text-fg">
                      {p.name}
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                ))}
              </nav>
            )}
            <h1 className="text-2xl font-bold">{heading}</h1>
            {docs && <p className="mt-1 text-sm text-muted">{t('home.count', { count: docs.length })}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5" role="group">
              {VIEW_OPTIONS.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  title={t(label)}
                  aria-label={t(label)}
                  aria-pressed={view === value}
                  className={cn('rounded-md p-1.5', view === value ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <Select aria-label={t('engagement.sortLabel')} value={sort} onChange={(e) => setParam('sort', e.target.value)} className="h-9 w-auto">
              <option value="">{t('engagement.sortNewest')}</option>
              <option value="views">{t('engagement.sortViews')}</option>
              <option value="likes">{t('engagement.sortLikes')}</option>
            </Select>
            {editor && (
              <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label={t('home.filterStatus')}>
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm',
                      (status ?? '') === s ? 'bg-surface-2 font-medium' : 'text-muted hover:text-fg',
                    )}
                  >
                    {s ? t(`status.${s}`) : t('common.all')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isPending ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <DocCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={FolderOpen}
            title={t('common.error')}
            description={errorMessage(error)}
            action={<Button onClick={() => refetch()}>{t('common.retry')}</Button>}
          />
        ) : docs.length === 0 ? (
          <EmptyState
            icon={q ? FileSearch : FolderOpen}
            title={q ? t('home.emptySearch') : t('home.empty')}
            action={
              editor && !q ? (
                <Link to="/new">
                  <Button>
                    <FilePlus2 className="h-4 w-4" /> {t('nav.newDoc')}
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : view === 'list' ? (
          <div data-tour="doc-list" className="space-y-3">
            {docs.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </div>
        ) : (
          <div data-tour="doc-list" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {docs.map((doc) => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
