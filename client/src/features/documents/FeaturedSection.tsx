// ============================================================
// FeaturedSection — khu "Nổi bật" đầu trang chủ
// ============================================================
//   [Bộ phận: Tất cả | PE IT | QA | Community ...]   ← mặc định: bộ phận của người xem
//   ┌──────────── banner tự chạy ───────────┐ ┌── bảng xếp hạng ──┐
//   │ bài TOP 1 của từng bảng, 6 giây đổi   │ │ 🔥 👁 ❤ ✨ (tab)    │
//   │ một bài, rê chuột vào thì dừng        │ │ 1. ...  2. ...     │
//   └───────────────────────────────────────┘ └────────────────────┘
// Các bảng: xem nhiều 7 ngày · xem nhiều nhất · nhiều tim nhất · mới nhất.
// Mọi số liệu tính TRONG bộ phận đang chọn (server lọc, xem routes/engagement.ts /tops).
// Chỉ hiện ở trang chủ "gốc" (không tìm kiếm / lọc / sắp xếp) — HomePage quyết định.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, ChevronLeft, ChevronRight, Clock, Eye, Flame, Heart, Sparkles, type LucideIcon } from 'lucide-react';
import { cn, formatRelative } from '../../lib/utils.ts';
import { useCurrentUser } from '../auth/queries.ts';
import CategoryIcon from '../categories/CategoryIcon.tsx';
import { matchDepartmentRoot } from '../categories/department.ts';
import { useCategoryTree } from '../categories/queries.ts';
import type { TopDoc, TopKind } from '../engagement/api.ts';
import { useTops } from '../engagement/queries.ts';
import DocCover from './DocCover.tsx';
import { useNow } from './cover.ts';

// Thứ tự bảng = thứ tự bài trên banner.
const KINDS: { kind: TopKind; icon: LucideIcon; color: string }[] = [
  { kind: 'views7', icon: Flame, color: 'text-danger' },
  { kind: 'likes', icon: Heart, color: 'text-danger' },
  { kind: 'views', icon: Eye, color: 'text-accent' },
  { kind: 'newest', icon: Sparkles, color: 'text-warning' },
];
const BANNER_INTERVAL = 6000; // khớp .banner-progress trong index.css

const titleOf = (d: TopDoc) => d.translated?.title ?? d.title;

export default function FeaturedSection() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { tree } = useCategoryTree();
  const roots = tree.map((n) => n.category);
  // Mặc định: bộ phận của người xem (thể loại gốc trùng tên bộ phận); không có thì "Tất cả".
  // Chưa bấm chọn (picked = null) thì luôn theo mặc định — danh sách thể loại tải xong sau cũng đúng.
  const [picked, setPicked] = useState<string | null>(null);
  // Bỏ thể loại dùng chung (Community...) như server: chúng không phải bộ phận.
  const departments = roots.filter((c) => !c.isShared && c.name.trim().toLowerCase() !== 'community');
  const ownRoot = user?.department ? matchDepartmentRoot(departments, user.department)?.id : undefined;
  const root = picked ?? ownRoot ?? '';
  const tops = useTops(root);

  // Banner: bài top 1 của từng bảng; một bài đứng đầu nhiều bảng thì gộp lại, ghi đủ các nhãn.
  const slides = useMemo(() => {
    const byDoc = new Map<string, { doc: TopDoc; kinds: TopKind[] }>();
    for (const { kind } of KINDS) {
      const first = tops.data?.[kind][0];
      if (!first) continue;
      const slide = byDoc.get(first.id);
      if (slide) slide.kinds.push(kind);
      else byDoc.set(first.id, { doc: first, kinds: [kind] });
    }
    return [...byDoc.values()];
  }, [tops.data]);

  return (
    <section className="mb-10 space-y-4">
      {roots.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="flex shrink-0 items-center gap-1 text-sm text-muted">
            <Building2 className="h-4 w-4" /> {t('home.department')}
          </span>
          {[{ id: '', name: t('common.all'), iconName: '' }, ...roots].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setPicked(c.id)}
              aria-pressed={root === c.id}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
                root === c.id ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted hover:border-accent/50 hover:text-fg',
              )}
            >
              {c.id && <CategoryIcon name={c.iconName} className="h-3.5 w-3.5" />}
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {tops.isPending ? (
          <div className="min-h-72 animate-pulse rounded-3xl bg-surface-2 sm:min-h-96" />
        ) : slides.length ? (
          // key = bộ phận: đổi bộ phận thì banner bắt đầu lại từ bài đầu.
          <Banner key={root} slides={slides} />
        ) : (
          <div className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-border text-sm text-muted sm:min-h-96">
            {t('home.noDocsInDepartment')}
          </div>
        )}
        <Rankings tops={tops.data} />
      </div>
    </section>
  );
}

// ---------- Banner tự chạy ----------

function Banner({ slides }: { slides: { doc: TopDoc; kinds: TopKind[] }[] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  // Rê chuột / bấm Tab vào banner thì dừng để người dùng đọc kịp.
  const [paused, setPaused] = useState(false);
  // Người dùng bật "giảm chuyển động" trong hệ điều hành -> không tự chạy.
  const [reduceMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const count = slides.length;
  const active = index % count;
  const autoplay = count > 1 && !paused && !reduceMotion;

  useEffect(() => {
    if (!autoplay) return;
    // setInterval sống ngoài React -> phải dọn trong hàm return, nếu không rời
    // trang rồi vẫn còn chạy ngầm. 🔸 Flutter: giống Timer.periodic + cancel() trong dispose().
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), BANNER_INTERVAL);
    return () => clearInterval(timer);
  }, [autoplay, count]);

  const go = (i: number) => setIndex((i + count) % count);

  return (
    <div
      className="group/banner relative min-h-72 overflow-hidden rounded-3xl border border-border shadow-sm sm:min-h-96"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {slides.map((s, i) => (
        // Xếp chồng mọi bài, chỉ bài đang chọn hiện rõ (mờ dần khi đổi). inert: bài ẩn không bấm / Tab tới được.
        <div
          key={s.doc.id}
          className={cn('absolute inset-0 transition-opacity duration-700', i === active ? 'opacity-100' : 'opacity-0')}
          inert={i !== active}
          aria-hidden={i !== active}
        >
          <Slide doc={s.doc} kinds={s.kinds} />
        </div>
      ))}

      {count > 1 && (
        <>
          {/* Vạch thời gian phía trên: chạy đầy thì sang bài kế. */}
          {autoplay && (
            <div className="absolute inset-x-0 top-0 h-1 bg-white/20">
              <div key={active} className={cn('banner-progress h-full bg-white/90', paused && 'paused')} />
            </div>
          )}
          <div className="absolute top-4 right-4 flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.doc.id}
                type="button"
                onClick={() => go(i)}
                aria-label={t('home.slide', { n: i + 1 })}
                aria-current={i === active}
                className={cn('h-2 rounded-full transition-all', i === active ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80')}
              />
            ))}
          </div>
          {[
            { dir: -1, Icon: ChevronLeft, cls: 'left-3', label: t('home.prevSlide') },
            { dir: 1, Icon: ChevronRight, cls: 'right-3', label: t('home.nextSlide') },
          ].map(({ dir, Icon, cls, label }) => (
            <button
              key={dir}
              type="button"
              onClick={() => go(active + dir)}
              aria-label={label}
              className={cn(
                'absolute top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition group-hover/banner:opacity-100 focus-visible:opacity-100 hover:bg-black/60 sm:flex',
                cls,
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function Slide({ doc, kinds }: { doc: TopDoc; kinds: TopKind[] }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const desc = doc.translated?.desc || doc.desc;
  return (
    <Link to={`/docs/${doc.slug}`} className="group absolute inset-0 flex">
      <div className="absolute inset-0">
        <DocCover doc={doc} iconClassName="h-24 w-24 -translate-y-10" />
      </div>
      {/* Lớp tối dần từ dưới lên để chữ trắng luôn đọc được, ảnh sáng cỡ nào cũng vậy. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="relative mt-auto w-full p-5 text-white sm:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {kinds.map((kind) => {
            const Icon = KINDS.find((k) => k.kind === kind)!.icon;
            return (
              <span key={kind} className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur">
                <Icon className="h-3.5 w-3.5" /> #1 {t(`home.top.${kind}`)}
              </span>
            );
          })}
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

// ---------- Bảng xếp hạng (tab) ----------

function Rankings({ tops }: { tops: Record<TopKind, TopDoc[]> | undefined }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<TopKind>('views7');
  const list = tops?.[kind] ?? [];
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 grid grid-cols-4 gap-1 rounded-xl bg-bg p-1" role="tablist">
        {KINDS.map(({ kind: k, icon: Icon, color }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            title={t(`home.top.${k}`)}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] leading-tight font-medium transition',
              kind === k ? 'bg-surface-2 text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            <Icon className={cn('h-4 w-4', kind === k && color)} />
            <span className="line-clamp-1">{t(`home.topShort.${k}`)}</span>
          </button>
        ))}
      </div>
      <h3 className="px-2 pt-1 pb-2 text-sm font-semibold">{t(`home.top.${kind}`)}</h3>
      {list.length ? (
        <ol className="space-y-1">
          {list.map((d, i) => (
            <li key={d.id}>
              <RankItem doc={d} rank={i + 1} kind={kind} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex flex-1 items-center justify-center px-2 py-8 text-center text-sm text-muted">{t('home.noRanking')}</p>
      )}
    </div>
  );
}

function RankItem({ doc, rank, kind }: { doc: TopDoc; rank: number; kind: TopKind }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  // Con số đúng với bảng đang xem.
  const metric = {
    views7: t('home.recentViews', { count: doc.recentViews }),
    views: t('home.totalViews', { count: doc.stats?.views ?? 0 }),
    likes: t('home.totalLikes', { count: doc.stats?.likes ?? 0 }),
    newest: formatRelative(doc.createdAt, i18n.language, now),
  }[kind];
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
        <p className="mt-0.5 text-xs text-muted">{metric}</p>
      </div>
    </Link>
  );
}
