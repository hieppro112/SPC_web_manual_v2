// ============================================================
// ReadingReportPage — Báo cáo đọc tài liệu  (/admin/reading)
// ============================================================
// Chọn một bài có quy định thời gian đọc -> mọi tài khoản quyền "Người dùng":
// chưa đọc / đang đọc (bao lâu) / đã đọc xong lúc nào. Xuất Excel.
// Chỉ tính phiên bản HIỆN TẠI của bài (bài sửa thì mọi người đọc lại từ đầu).

import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BookOpenCheck, Download } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Select from '../../components/ui/Select.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { cn, errorMessage, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { mmss, readingApi } from './api.ts';
import { useReadingReport, useRuledDocs } from './queries.ts';

export default function ReadingReportPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('reading.reportTitle'));
  const docs = useRuledDocs();
  const [chosen, setChosen] = useState('');
  // Chưa chọn -> bài đầu tiên trong danh sách.
  const docId = chosen || docs.data?.[0]?.id;
  const report = useReadingReport(docId);
  const rows = report.data?.rows ?? [];
  const doneCount = rows.filter((r) => r.completedAt).length;

  return (
    <div className="mx-auto max-w-page space-y-6 px-4 py-8 lg:px-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BookOpenCheck className="h-6 w-6 text-accent" /> {t('reading.reportTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('reading.reportHint')}</p>
      </header>

      {docs.isPending ? (
        <Spinner />
      ) : !docs.data?.length ? (
        <EmptyState icon={BookOpenCheck} title={t('reading.noRuledDocs')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={docId} onChange={(e) => setChosen(e.target.value)} className="w-auto min-w-72">
              {docs.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({mmss(d.requiredSeconds)})
                </option>
              ))}
            </Select>
            {report.data && (
              <span className="text-sm text-muted">{t('reading.summary', { done: doneCount, total: rows.length, version: report.data.doc.version })}</span>
            )}
            {docId && (
              // Link tải thẳng (cookie đăng nhập đi kèm), trình duyệt tự lưu file .xlsx.
              <a href={readingApi.excelUrl(docId)} className="ml-auto">
                <Button size="sm" variant="secondary">
                  <Download className="h-4 w-4" /> {t('quiz.exportExcel')}
                </Button>
              </a>
            )}
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
                    <th className="px-4 py-2 font-medium">{t('quiz.colName')}</th>
                    <th className="px-4 py-2 font-medium">{t('reading.colTime')}</th>
                    <th className="px-4 py-2 font-medium">{t('reading.colEnd')}</th>
                    <th className="px-4 py-2 font-medium">{t('quiz.colResult')}</th>
                    <th className="px-4 py-2 font-medium">{t('reading.colLast')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const status = r.completedAt ? 'done' : r.startedAt ? 'reading' : 'none';
                    return (
                      <tr key={r.userId}>
                        <td className="px-4 py-2">
                          {r.displayName} <span className="text-xs text-muted">@{r.username}</span>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {r.startedAt ? `${mmss(r.seconds)} / ${mmss(report.data?.requiredSeconds ?? 0)}` : '—'}
                        </td>
                        <td className="px-4 py-2">{r.startedAt ? (r.reachedEnd ? '✓' : '—') : ''}</td>
                        <td className={cn('px-4 py-2 font-medium', status === 'done' ? 'text-success' : status === 'reading' ? 'text-warning' : 'text-muted')}>
                          {t(`reading.status.${status}`)}
                        </td>
                        <td className="px-4 py-2 text-muted">
                          {r.completedAt
                            ? formatDateTime(r.completedAt, i18n.language)
                            : r.lastReadAt
                              ? formatDateTime(r.lastReadAt, i18n.language)
                              : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {report.data && (
            <p className="text-xs text-muted">
              <Link to={`/docs/${report.data.doc.slug}`} className="text-accent hover:underline">
                📄 {report.data.doc.title}
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
