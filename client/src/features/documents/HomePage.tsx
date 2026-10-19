// ============================================================
// HomePage — danh sách tài liệu (lọc theo thể loại, tìm kiếm, trạng thái)
// ============================================================
// Mọi bộ lọc đều nằm trên URL: /?category=...&q=...&status=draft
// -> bấm F5, nút Back, gửi link cho đồng nghiệp đều giữ nguyên bộ lọc.
// 🔸 Flutter: giống đưa tham số vào route của go_router thay vì giữ trong State.

import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FilePlus2, FileSearch, FolderOpen } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import SearchBox from '../../components/SearchBox.tsx';
import { isEditor, type DocStatus } from '../../lib/types.ts';
import { cn, errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCurrentUser } from '../auth/queries.ts';
import CategoryNav from '../categories/CategoryNav.tsx';
import { useCategories } from '../categories/queries.ts';
import { useCompleteTask } from '../guide/queries.ts';
import { categoryPath } from '../categories/tree.ts';
import DocCard from './DocCard.tsx';
import { useDocuments } from './queries.ts';

const STATUS_FILTERS: (DocStatus | '')[] = ['', 'published', 'draft'];

export default function HomePage() {
  const { t } = useTranslation();
  // Lọc nháp / tạo tài liệu: chỉ người soạn (role "user" chỉ thấy bài đã xuất bản).
  const editor = isEditor(useCurrentUser());
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const statusParam = params.get('status');
  const status = statusParam === 'draft' || statusParam === 'published' ? statusParam : undefined;

  const { data: categories } = useCategories();
  const { data: docs, isPending, error, refetch } = useDocuments({ q, category, status });
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

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    setParams(next, { replace: true });
  };

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

      <main>
        <SearchBox className="mb-4 md:hidden" />
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

        {isPending ? (
          <Spinner />
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
        ) : (
          <div data-tour="doc-list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {docs.map((doc) => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
