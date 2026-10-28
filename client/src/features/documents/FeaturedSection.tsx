// ============================================================
// FeaturedSection — khu "Nổi bật" đầu trang chủ
// ============================================================
//   Trái:  bài MỚI NHẤT (theo ngày tạo), ảnh bìa lớn, chữ đè trên ảnh.
//   Phải:  "Xem nhiều 7 ngày" (top 5). Chưa có lượt xem nào thì thay bằng
//          "Mới cập nhật" để khu này không bao giờ trống.
// Chỉ hiện ở trang chủ "gốc" (không tìm kiếm / lọc / sắp xếp) — HomePage quyết định.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, Eye, Flame, Heart, History, Sparkles } from 'lucide-react';
import type { DocSummary } from '../../lib/types.ts';
import { cn, formatRelative } from '../../lib/utils.ts';
import CategoryIcon from '../categories/CategoryIcon.tsx';
import { useTrending } from '../engagement/queries.ts';
import DocCover from './DocCover.tsx';
import { useNow } from './cover.ts';

const titleOf = (d: DocSummary) => d.translated?.title ?? d.title;

export default function FeaturedSection({ docs }: { docs: DocSummary[] }) {
  const { t } = useTranslation();
  const trending = useTrending();
  // Bài mới nhất: ưu tiên bài đã xuất bản (editor thấy cả nháp trong danh sách).
  const hero = useMemo(() => {
    const published = docs.filter((d) => d.status === 'published');
    return [...(published.length ? published : docs)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }, [docs]);

  if (!hero) return null;
  const hot = trending.data ?? [];
  // Chưa có ai xem bài nào trong 7 ngày -> 5 bài mới cập nhật (trừ bài đang ở khu lớn).
  const side: { doc: DocSummary; recentViews?: number }[] = hot.length
    ? hot.map((d) => ({ doc: d, recentViews: d.recentViews }))
    : docs
        .filter((d) => d.id !== hero.id)
        .slice(0, 5)
        .map((d) => ({ doc: d }));

  return (
    <section className="mb-10 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <HeroCard doc={hero} />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          {hot.length ? <Flame className="h-5 w-5 text-danger" /> : <History className="h-5 w-5 text-accent" />}
          {hot.length ? t('home.trending') : t('home.recentlyUpdated')}
        </h2>
        <ol className="space-y-1">
          {side.map((s, i) => (
            <li key={s.doc.id}>
              <SideItem doc={s.doc} rank={i + 1} recentViews={s.recentViews} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function HeroCard({ doc }: { doc: DocSummary }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const desc = doc.translated?.desc || doc.desc;
  return (
    <Link
      to={`/docs/${doc.slug}`}
      className="group relative flex min-h-72 overflow-hidden rounded-3xl border border-border shadow-sm transition duration-300 hover:shadow-2xl hover:shadow-accent/15 sm:min-h-96"
    >
      <div className="absolute inset-0">
        <DocCover doc={doc} iconClassName="h-24 w-24 -translate-y-10" />
      </div>
      {/* Lớp tối dần từ dưới lên để chữ trắng luôn đọc được, ảnh sáng cỡ nào cũng vậy. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="relative mt-auto w-full p-5 text-white sm:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 tracking-wide uppercase backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> {t('home.latest')}
          </span>
          {doc.category && (
            <span className="flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 backdrop-blur">
              <CategoryIcon name={doc.category.iconName} className="h-3.5 w-3.5" /> {doc.category.name}
            </span>
          )}
        </div>
        <h2 className="line-clamp-2 text-2xl leading-tight font-bold drop-shadow sm:text-3xl">{titleOf(doc)}</h2>
        {desc && <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/85 sm:text-base">{desc}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80">
          <span>{formatRelative(doc.createdAt, i18n.language, now)}</span>
          {!!doc.readMinutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" /> {t('home.readMinutes', { count: doc.readMinutes })}
            </span>
          )}
          {doc.stats && (
            <>
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" /> {doc.stats.views}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4" /> {doc.stats.likes}
              </span>
            </>
          )}
          <span className="ml-auto flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black transition group-hover:gap-2">
            {t('home.readNow')} <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function SideItem({ doc, rank, recentViews }: { doc: DocSummary; rank: number; recentViews?: number }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  return (
    <Link to={`/docs/${doc.slug}`} className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-bg">
      {/* Số thứ hạng: top 3 nổi màu. */}
      <span className={cn('w-6 shrink-0 text-center text-xl font-black tabular-nums', rank <= 3 ? 'text-accent' : 'text-muted/50')}>
        {rank}
      </span>
      <div className="relative aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        <DocCover doc={doc} iconClassName="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug font-medium group-hover:text-accent">{titleOf(doc)}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
          {recentViews !== undefined ? (
            <>
              <Eye className="h-3 w-3" /> {t('home.recentViews', { count: recentViews })}
            </>
          ) : (
            formatRelative(doc.updatedAt, i18n.language, now)
          )}
        </p>
      </div>
    </Link>
  );
}
