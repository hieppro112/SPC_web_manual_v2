// ============================================================
// QuizListPage — danh sách bài kiểm tra  (/quizzes)
// ============================================================
//   Ai đăng nhập cũng thấy: "Bài kiểm tra của tôi" (được làm + điểm của mình)
//   Editor / admin thấy thêm: "Quản lý bài kiểm tra" (mọi bộ đề, sửa / xóa / kết quả)

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BarChart3, CalendarClock, ClipboardCheck, Pencil, Play, RotateCcw, Sparkles, Trash } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { isEditor } from '../../lib/types.ts';
import { cn, errorMessage, formatDate, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useAiStatus } from '../ai/queries.ts';
import { useCurrentUser } from '../auth/queries.ts';
import type { ManagedQuiz, MyQuiz } from './api.ts';
import { useDeleteQuiz, useManagedQuizzes, useMyQuizzes } from './queries.ts';

export default function QuizListPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const editor = isEditor(user);
  const mine = useMyQuizzes();
  const managed = useManagedQuizzes(editor);
  const { data: aiStatus } = useAiStatus();
  useDocumentTitle(t('quiz.title'));

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
      <section>
        <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
          <ClipboardCheck className="h-6 w-6 text-accent" /> {t('quiz.myQuizzes')}
        </h1>
        {mine.isPending ? (
          <Spinner />
        ) : mine.error ? (
          <EmptyState icon={ClipboardCheck} title={t('common.error')} description={errorMessage(mine.error)} />
        ) : !mine.data.length ? (
          <EmptyState icon={ClipboardCheck} title={t('quiz.emptyMine')} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {mine.data.map((q) => (
              <MyQuizCard key={q.id} quiz={q} />
            ))}
          </div>
        )}
      </section>

      {editor && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{t('quiz.manage')}</h2>
            {aiStatus?.enabled && (
              <Link to="/quizzes/new">
                <Button>
                  <Sparkles className="h-4 w-4" /> {t('quiz.createWithAi')}
                </Button>
              </Link>
            )}
          </div>
          {managed.isPending ? (
            <Spinner />
          ) : !managed.data?.length ? (
            <EmptyState icon={Sparkles} title={t('quiz.emptyManage')} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {managed.data.map((q) => (
                    <ManagedRow key={q.id} quiz={q} isAdmin={user?.role === 'admin'} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MyQuizCard({ quiz: q }: { quiz: MyQuiz }) {
  const { t, i18n } = useTranslation();
  const exam = q.kind === 'exam';
  const expired = !!q.dueAt && new Date(q.dueAt).getTime() < Date.now();
  const outOfAttempts = exam && q.my.attempts >= q.maxAttempts;

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-bg p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={exam ? 'accent' : 'neutral'}>{t(`quiz.kind.${q.kind}`)}</Badge>
        {q.assigned && <Badge tone="warning">{t('quiz.assigned')}</Badge>}
        {q.my.passed !== null && (
          <Badge className={q.my.passed ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}>
            {q.my.percentage}% · {q.my.passed ? t('quiz.passed') : t('quiz.failed')}
          </Badge>
        )}
      </div>
      <h3 className="font-semibold">{q.title}</h3>
      <p className="mt-1 text-sm text-muted">{t('quiz.info', { count: q.questionCount, percent: q.passPercent })}</p>
      {exam && <p className="text-sm text-muted">{t('quiz.attemptsInfo', { used: q.my.attempts, max: q.maxAttempts })}</p>}
      {q.dueAt && (
        <p className={cn('mt-1 flex items-center gap-1 text-sm', expired ? 'text-danger' : 'text-muted')}>
          <CalendarClock className="h-4 w-4" /> {expired ? t('quiz.overdue') : t('quiz.due', { date: formatDateTime(q.dueAt, i18n.language) })}
        </p>
      )}
      <div className="mt-auto pt-3">
        {exam && (expired || outOfAttempts) ? (
          <p className="text-sm text-muted">{expired ? t('quiz.blocked.expired') : t('quiz.blocked.no_attempts_left')}</p>
        ) : (
          <Link to={`/quizzes/${q.id}`}>
            <Button size="sm">
              {q.my.attempts > 0 ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {q.my.attempts > 0 ? t('quiz.retake') : t('quiz.start')}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function ManagedRow({ quiz: q, isAdmin }: { quiz: ManagedQuiz; isAdmin: boolean }) {
  const { t, i18n } = useTranslation();
  const remove = useDeleteQuiz();

  const onDelete = () => {
    if (!window.confirm(t('quiz.deleteConfirm', { title: q.title }))) return;
    remove.mutate(q.id, { onSuccess: () => toast.success(t('quiz.deleted')), onError: (err) => toast.error(errorMessage(err)) });
  };

  return (
    <tr className="hover:bg-surface">
      <td className="px-4 py-3">
        <p className="font-medium">{q.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <Badge tone={q.kind === 'exam' ? 'accent' : 'neutral'}>{t(`quiz.kind.${q.kind}`)}</Badge>
          <Badge tone={q.status === 'draft' ? 'warning' : 'neutral'}>{t(`quiz.status.${q.status}`)}</Badge>
          {t('quiz.questions', { count: q.questionCount })}
          {q.kind === 'exam' && <> · {t('quiz.assigneeCount', { count: q.assigneeCount })} · {t('quiz.attemptCount', { count: q.attemptCount })}</>}
          {' · '}
          {formatDate(q.updatedAt, i18n.language)}
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <Link to={`/quizzes/${q.id}`} title={t('quiz.preview')}>
            <Button size="sm" variant="ghost">
              <Play className="h-4 w-4" />
            </Button>
          </Link>
          <Link to={`/quizzes/${q.id}/edit`} title={t('quiz.edit')}>
            <Button size="sm" variant="ghost">
              <Pencil className="h-4 w-4" />
            </Button>
          </Link>
          {isAdmin && q.kind === 'exam' && (
            <Link to={`/quizzes/${q.id}/results`} title={t('quiz.results')}>
              <Button size="sm" variant="ghost">
                <BarChart3 className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <Button size="sm" variant="ghost" className="text-danger" onClick={onDelete} loading={remove.isPending} title={t('common.delete')}>
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
