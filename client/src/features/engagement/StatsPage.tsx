// ============================================================
// StatsPage — Thống kê tài liệu cho admin  (/admin/stats)
// ============================================================
// Chọn khoảng ngày -> bảng mọi tài liệu: lượt xem, số người xem, tim trong kỳ,
// tổng tim; bấm tiêu đề cột để sắp xếp. Xuất Excel đúng khoảng ngày đó.

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BarChart3, Download } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { cn, errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { engagementApi, type EngagementRow } from './api.ts';
import { useEngagementReport } from './queries.ts';

type SortKey = 'views' | 'viewers' | 'likes' | 'totalLikes';

// Ngày theo giờ máy, dạng 'YYYY-MM-DD' (đúng định dạng của <input type="date">).
const dayString = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export default function StatsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('engagement.statsTitle'));
  // Mặc định 30 ngày gần nhất. Lazy init: chỉ tính lúc mở trang.
  const [to, setTo] = useState(() => dayString(new Date()));
  const [from, setFrom] = useState(() => dayString(new Date(Date.now() - 29 * 24 * 3600_000)));
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const report = useEngagementReport(from, to);

  const rows = useMemo(
    () => [...(report.data?.rows ?? [])].sort((a: EngagementRow, b: EngagementRow) => b[sortKey] - a[sortKey]),
    [report.data, sortKey],
  );
  const totals = rows.reduce((s, r) => ({ views: s.views + r.views, likes: s.likes + r.likes }), { views: 0, likes: 0 });

  const header = (key: SortKey, label: string) => (
    <th className="px-4 py-2 text-right font-medium">
      <button type="button" onClick={() => setSortKey(key)} className={cn('hover:text-fg', sortKey === key && 'font-semibold text-fg')}>
        {label} {sortKey === key && '↓'}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-page space-y-6 px-4 py-8 lg:px-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BarChart3 className="h-6 w-6 text-accent" /> {t('engagement.statsTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('engagement.statsHint')}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted">{t('engagement.from')}</span>
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">{t('engagement.to')}</span>
          <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        {report.data && (
          <span className="pb-2 text-sm text-muted">{t('engagement.totals', { views: totals.views, likes: totals.likes })}</span>
        )}
        {/* Link tải thẳng (cookie đăng nhập đi kèm), trình duyệt tự lưu file .xlsx. */}
        <a href={engagementApi.excelUrl(from, to)} className="ml-auto">
          <Button size="sm" variant="secondary">
            <Download className="h-4 w-4" /> {t('quiz.exportExcel')}
          </Button>
        </a>
      </div>

      {report.isPending ? (
        <Spinner />
      ) : report.error ? (
        <p className="text-sm text-danger">{errorMessage(report.error)}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">{t('engagement.colDoc')}</th>
                {header('views', t('engagement.views'))}
                {header('viewers', t('engagement.viewers'))}
                {header('likes', t('engagement.likesInRange'))}
                {header('totalLikes', t('engagement.totalLikes'))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-muted tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2">
                    <Link to={`/docs/${r.slug}`} className="font-medium hover:text-accent">
                      {r.title}
                    </Link>
                    <span className="ml-2 text-xs text-muted">
                      {r.category ?? '—'}
                      {r.status === 'draft' && ` · ${t('status.draft')}`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.views}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.viewers}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.likes}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.totalLikes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
