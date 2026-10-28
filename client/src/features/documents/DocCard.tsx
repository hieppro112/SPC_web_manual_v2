// ============================================================
// DocCard / DocRow — một tài liệu trong danh sách
// ============================================================
//   DocCard: thẻ dạng lưới (ảnh bìa trên, chữ dưới)
//   DocRow:  một hàng dạng danh sách (ảnh nhỏ trái, chữ phải) — đọc lướt nhanh
// Hai kiểu dùng chung các mảnh nhỏ bên dưới (nhãn, dòng số liệu) để luôn giống nhau.
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Clock, Eye, Heart, Languages } from 'lucide-react';
import type { DocSummary } from '../../lib/types.ts';
import { cn, formatDateTime, formatRelative } from '../../lib/utils.ts';
import CategoryIcon from '../categories/CategoryIcon.tsx';
import DocCover from './DocCover.tsx';
import { isNewDoc, useNow } from './cover.ts';

// Nhãn nổi trên ảnh bìa: "Mới" (tạo trong 7 ngày) + "Nháp".
function CoverBadges({ doc }: { doc: DocSummary }) {
  const { t } = useTranslation();
  const now = useNow();
  return (
    <div className="absolute top-2.5 left-2.5 flex gap-1.5">
      {isNewDoc(doc, now) && (
        <span className="rounded-full bg-success px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase shadow-sm">
          {t('home.newBadge')}
        </span>
      )}
      {doc.status === 'draft' && (
        <span className="rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">{t('status.draft')}</span>
      )}
    </div>
  );
}

// "~3 phút đọc" ở góc dưới ảnh bìa.
function ReadTime({ minutes }: { minutes?: number }) {
  const { t } = useTranslation();
  if (!minutes) return null;
  return (
    <span className="absolute right-2.5 bottom-2.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
      <Clock className="h-3 w-3" /> {t('home.readMinutes', { count: minutes })}
    </span>
  );
}

// Tên thể loại nhỏ phía trên tiêu đề.
function CategoryLabel({ doc }: { doc: DocSummary }) {
  if (!doc.category) return null;
  return (
    <p className="flex items-center gap-1 text-xs font-semibold tracking-wide text-accent uppercase">
      <CategoryIcon name={doc.category.iconName} className="h-3.5 w-3.5" />
      <span className="truncate">{doc.category.name}</span>
    </p>
  );
}

// Tiêu đề (bản dịch nếu có; rê chuột thấy tiêu đề gốc).
function Title({ doc, className }: { doc: DocSummary; className?: string }) {
  return (
    <h3 className={cn('font-semibold leading-snug group-hover:text-accent', className)} title={doc.translated ? doc.title : undefined}>
      {doc.translated && <Languages className="mr-1 inline h-3.5 w-3.5 text-muted" />}
      {doc.translated?.title ?? doc.title}
    </h3>
  );
}

// "3 ngày trước · 👁 12 ❤ 4"
export function DocMeta({ doc, className }: { doc: DocSummary; className?: string }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  return (
    <p className={cn('flex items-center gap-3 text-xs text-muted', className)}>
      <span title={t('home.updated', { date: formatDateTime(doc.updatedAt, i18n.language) })}>
        {formatRelative(doc.updatedAt, i18n.language, now)}
      </span>
      {doc.stats && (
        <span className="ml-auto flex items-center gap-2.5">
          <span className="flex items-center gap-1" title={t('engagement.views')}>
            <Eye className="h-3.5 w-3.5" /> {doc.stats.views}
          </span>
          <span className="flex items-center gap-1" title={t('engagement.likes')}>
            <Heart className="h-3.5 w-3.5" /> {doc.stats.likes}
          </span>
        </span>
      )}
    </p>
  );
}

const desc = (doc: DocSummary) => doc.translated?.desc || doc.desc;

export default function DocCard({ doc }: { doc: DocSummary }) {
  return (
    <Link
      to={`/docs/${doc.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-bg transition duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl hover:shadow-accent/10"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        <DocCover doc={doc} />
        <CoverBadges doc={doc} />
        <ReadTime minutes={doc.readMinutes} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <CategoryLabel doc={doc} />
        <Title doc={doc} className="mt-1.5 line-clamp-2" />
        {desc(doc) && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{desc(doc)}</p>}
        <DocMeta doc={doc} className="mt-auto pt-4" />
      </div>
    </Link>
  );
}

export function DocRow({ doc }: { doc: DocSummary }) {
  return (
    <Link
      to={`/docs/${doc.slug}`}
      className="group flex gap-4 rounded-2xl border border-border bg-bg p-3 transition duration-300 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10"
    >
      <div className="relative aspect-[16/10] w-28 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-48">
        <DocCover doc={doc} iconClassName="h-8 w-8" />
        <CoverBadges doc={doc} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <CategoryLabel doc={doc} />
        <Title doc={doc} className="mt-1 line-clamp-2 sm:text-lg" />
        {/* Điện thoại hẹp: bỏ mô tả cho gọn. (line-clamp tự đặt display nên bọc thêm một lớp để ẩn / hiện.) */}
        {desc(doc) && (
          <div className="mt-1 hidden sm:block">
            <p className="line-clamp-2 text-sm text-muted">{desc(doc)}</p>
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-2">
          {!!doc.readMinutes && <ReadTimeInline minutes={doc.readMinutes} />}
          <DocMeta doc={doc} className="flex-1" />
        </div>
      </div>
    </Link>
  );
}

function ReadTimeInline({ minutes }: { minutes: number }) {
  const { t } = useTranslation();
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
      <Clock className="h-3.5 w-3.5" /> {t('home.readMinutes', { count: minutes })}
    </span>
  );
}

// Khung xám nhấp nháy trong lúc chờ tải danh sách (thay cho vòng quay).
export function DocCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="aspect-[16/9] animate-pulse bg-surface-2" />
      <div className="space-y-2.5 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}
