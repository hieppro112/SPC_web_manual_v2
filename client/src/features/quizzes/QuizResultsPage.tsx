// ============================================================
// QuizResultsPage — bảng điểm cho admin + xuất Excel  (/quizzes/:id/results)
// ============================================================
// Mỗi người MỘT dòng = lần làm GẦN NHẤT (theo luật đã chốt), kèm số lần đã
// làm. Người được giao mà chưa làm vẫn có dòng "Chưa làm".

import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileSpreadsheet, Users } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { errorMessage, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { quizzesApi } from './api.ts';
import { useQuizResults } from './queries.ts';

export default function QuizResultsPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { data, isPending, error } = useQuizResults(id);
  useDocumentTitle(data?.quiz.title);

  if (isPending) return <Spinner className="py-24" />;
  if (error || !data) return <EmptyState icon={Users} title={t('common.error')} description={errorMessage(error)} />;

  const taken = data.rows.filter((r) => r.passed !== null);
  const passed = taken.filter((r) => r.passed).length;

  return (
    <div className="mx-auto max-w-form px-4 py-8">
      <Link to="/quizzes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t('quiz.title')}
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('quiz.resultsTitle', { title: data.quiz.title })}</h1>
          <p className="mt-1 text-sm text-muted">
            {t('quiz.summary', { passed, taken: taken.length, notTaken: data.rows.length - taken.length })} ·{' '}
            {t('quiz.info', { count: data.quiz.questionCount, percent: data.quiz.passPercent })}
          </p>
        </div>
        {/* <a download>: trình duyệt tải file, cookie đăng nhập tự gửi kèm. */}
        <a href={quizzesApi.excelUrl(id)} download>
          <Button variant="secondary">
            <FileSpreadsheet className="h-4 w-4" /> {t('quiz.exportExcel')}
          </Button>
        </a>
      </div>

      {!data.rows.length ? (
        <EmptyState icon={Users} title={t('quiz.emptyResults')} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('quiz.colName')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('quiz.colAttempts')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('quiz.colScore')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('quiz.colResult')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('quiz.colSubmitted')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.displayName}</p>
                    <p className="font-mono text-xs text-muted">
                      @{r.username} {r.assigned && `· ${t('quiz.assignedShort')}`}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.attempts}/{data.quiz.maxAttempts}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{r.total !== null ? `${r.score}/${r.total} (${r.percentage}%)` : '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.passed === null ? (
                      <Badge>{t('quiz.notTaken')}</Badge>
                    ) : (
                      <Badge className={r.passed ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}>
                        {r.passed ? t('quiz.passed') : t('quiz.failed')}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.submittedAt ? formatDateTime(r.submittedAt, i18n.language) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">{t('quiz.retentionNote')}</p>
    </div>
  );
}
