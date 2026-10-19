// DocCard — một tài liệu trong danh sách ở trang chủ.
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import type { DocSummary } from '../../lib/types.ts';
import { formatDate } from '../../lib/utils.ts';
import CategoryIcon from '../categories/CategoryIcon.tsx';

export default function DocCard({ doc }: { doc: DocSummary }) {
  const { t, i18n } = useTranslation();

  return (
    <Link
      to={`/docs/${doc.slug}`}
      className="group block rounded-2xl border border-border bg-bg p-5 transition hover:border-accent/50 hover:shadow-md"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {doc.category && (
          <Badge tone="accent">
            <CategoryIcon name={doc.category.iconName} className="h-3 w-3" /> {doc.category.name}
          </Badge>
        )}
        {doc.status === 'draft' && <Badge tone="warning">{t('status.draft')}</Badge>}
      </div>
      {/* Có bản dịch sang ngôn ngữ người đọc -> hiện tiêu đề đã dịch, rê chuột thấy tiêu đề gốc. */}
      <h3 className="font-semibold group-hover:text-accent" title={doc.translated ? doc.title : undefined}>
        {doc.translated && <Languages className="mr-1 inline h-3.5 w-3.5 text-muted" />}
        {doc.translated?.title ?? doc.title}
      </h3>
      {(doc.translated?.desc || doc.desc) && <p className="mt-1 line-clamp-2 text-sm text-muted">{doc.translated?.desc || doc.desc}</p>}
      <p className="mt-3 text-xs text-muted">{t('home.updated', { date: formatDate(doc.updatedAt, i18n.language) })}</p>
    </Link>
  );
}
