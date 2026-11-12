// ============================================================
// DocNeighbors — "bài cùng thể loại" ở 2 chỗ trên trang đọc
// ============================================================
//   SameCategoryList  danh sách gọn ở cột phải (dưới mục lục), bấm là sang bài
//   DocNeighborsEnd   cuối bài: nút "Bài trước / Bài sau" + lưới thẻ bài cùng loại
//                     (màn hình nhỏ không có cột phải -> đây là chỗ chuyển bài chính)
//
// Thứ tự: theo TÊN, so số tự nhiên ("2. ..." đứng trước "10. ...") -> bộ bài đánh số
// (vd bài hướng dẫn 1–6) đi đúng trình tự khi bấm "Bài sau".

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Clock, Eye, FolderOpen } from 'lucide-react';
import type { DocSummary } from '../../lib/types.ts';
import { cn } from '../../lib/utils.ts';

const titleOf = (d: DocSummary) => d.translated?.title ?? d.title;

// (Không export hàm thường từ file component: Vite "Fast Refresh" chỉ nạp nóng
//  được file mà MỌI thứ export đều là component.)
function sortSiblings(list: DocSummary[]): DocSummary[] {
  return [...(list ?? [])].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
}

const LIST_LIMIT = 8;

type ListProps = { siblings: DocSummary[]; currentId: string; categoryId: string };

export function SameCategoryList({ siblings: raw, currentId, categoryId }: ListProps) {
  const { t } = useTranslation();
  const siblings = sortSiblings(raw);
  if (siblings.length < 2) return null;
  // Quá nhiều bài: lấy một "cửa sổ" quanh bài đang đọc thay vì luôn lấy 8 bài đầu.
  const index = siblings.findIndex((s) => s.id === currentId);
  const start = Math.max(0, Math.min(index - Math.floor(LIST_LIMIT / 2), siblings.length - LIST_LIMIT));
  const shown = siblings.slice(start, start + LIST_LIMIT);

  return (
    <nav aria-label={t('doc.inThisCategory')}>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t('doc.inThisCategory')}</h2>
      <ul className="space-y-0.5">
        {shown.map((s) => (
          <li key={s.id}>
            <Link
              to={`/docs/${s.slug}`}
              aria-current={s.id === currentId ? 'page' : undefined}
              className={cn(
                'line-clamp-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                s.id === currentId ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {titleOf(s)}
            </Link>
          </li>
        ))}
      </ul>
      {siblings.length > shown.length && (
        <Link to={`/?category=${categoryId}`} className="mt-1 block px-2.5 text-xs font-medium text-accent hover:underline">
          {t('doc.seeAll', { count: siblings.length })}
        </Link>
      )}
    </nav>
  );
}

const RELATED_LIMIT = 6;

type EndProps = ListProps & { categoryName: string };

export function DocNeighborsEnd({ siblings: raw, currentId, categoryId, categoryName }: EndProps) {
  const { t } = useTranslation();
  const siblings = sortSiblings(raw);
  const index = siblings.findIndex((s) => s.id === currentId);
  if (index < 0 || siblings.length < 2) return null;
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  // Bài liên quan: ưu tiên các bài đứng SAU bài đang đọc, hết thì vòng lại từ đầu.
  const others = [...siblings.slice(index + 1), ...siblings.slice(0, index)].slice(0, RELATED_LIMIT);

  return (
    <div className="no-print mt-12 space-y-10">
      {/* Bài trước / Bài sau */}
      <div className="grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link to={`/docs/${prev.slug}`} className="group rounded-xl border border-border p-4 transition-colors hover:border-accent hover:bg-accent-soft/40">
            <span className="flex items-center gap-1 text-xs text-muted">
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> {t('doc.prev')}
            </span>
            <span className="mt-1 line-clamp-2 block font-semibold group-hover:text-accent">{titleOf(prev)}</span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next && (
          <Link
            to={`/docs/${next.slug}`}
            className="group rounded-xl border border-border p-4 text-right transition-colors hover:border-accent hover:bg-accent-soft/40"
          >
            <span className="flex items-center justify-end gap-1 text-xs text-muted">
              {t('doc.next')} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="mt-1 line-clamp-2 block font-semibold group-hover:text-accent">{titleOf(next)}</span>
          </Link>
        )}
      </div>

      {/* Lưới bài cùng thể loại */}
      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FolderOpen className="h-5 w-5 text-accent" /> {t('doc.relatedTitle', { name: categoryName })}
          </h2>
          <Link to={`/?category=${categoryId}`} className="text-sm font-medium text-accent hover:underline">
            {t('doc.seeAll', { count: siblings.length })}
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((s) => (
            <Link key={s.id} to={`/docs/${s.slug}`} className="group flex flex-col rounded-xl border border-border bg-bg p-4 transition-shadow hover:shadow-md">
              <span className="line-clamp-2 font-semibold group-hover:text-accent">{titleOf(s)}</span>
              {(s.translated?.desc ?? s.desc) && <span className="mt-1 line-clamp-2 text-sm text-muted">{s.translated?.desc ?? s.desc}</span>}
              <span className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted">
                {!!s.readMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {t('doc.readMinutes', { count: s.readMinutes })}
                  </span>
                )}
                {s.stats && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {s.stats.views}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
