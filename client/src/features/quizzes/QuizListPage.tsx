// ============================================================
// QuizListPage — danh sách bài kiểm tra  (/quizzes)
// ============================================================
//   Ai đăng nhập cũng thấy: "Bài kiểm tra của tôi" (được làm + điểm của mình)
//   Editor / admin thấy thêm: "Quản lý bài kiểm tra" (mọi bộ đề, sửa / xóa / kết quả)

import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  FileText,
  FolderOpen,
  LoaderCircle,
  Lock,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trash,
  X,
} from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { isEditor } from '../../lib/types.ts';
import { cn, errorMessage, formatDate, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCurrentUser } from '../auth/queries.ts';
import { documentsApi } from '../documents/api.ts';
import type { ManagedQuiz, MyQuiz, QuizJob, QuizJobStatus } from './api.ts';
import { useCancelQuizJob, useDeleteQuiz, useManagedQuizzes, useMarkJobSeen, useMyQuizzes, useQuizJobs } from './queries.ts';

// ---------- Yêu cầu "nhờ Claude tạo đề" ----------

const JOB_TONES: Record<QuizJobStatus, string> = {
  pending: 'bg-surface-2 text-muted',
  processing: 'bg-accent-soft text-accent',
  done: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
  expired: 'bg-warning-soft text-warning',
  cancelled: 'bg-surface-2 text-muted',
};

function QuizJobsSection() {
  const { t } = useTranslation();
  const { data } = useQuizJobs(true);
  // Chỉ hiện các yêu cầu gần đây còn đáng xem: chưa xong, hoặc xong/lỗi trong 7 ngày.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const jobs = (data?.jobs ?? []).filter(
    (j) => j.status === 'pending' || j.status === 'processing' || (j.status !== 'cancelled' && new Date(j.createdAt).getTime() > weekAgo),
  );
  if (!jobs.length) return null;

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <Send className="h-5 w-5 text-accent" /> {t('quiz.jobs.title')}
      </h2>
      <p className="mb-4 text-sm text-muted">{t('quiz.jobs.subtitle', { hours: data?.timeoutHours ?? 48 })}</p>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </ul>
    </section>
  );
}

function JobRow({ job }: { job: QuizJob }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const cancel = useCancelQuizJob();
  const markSeen = useMarkJobSeen();
  const docsParam = job.sourceDocs.map((d) => d.id).join(',');
  const waiting = job.status === 'pending' || job.status === 'processing';

  // Mở đề Claude vừa tạo: đánh dấu "đã xem" (tắt chấm đỏ) rồi sang trình sửa đề.
  const openQuiz = () => {
    if (!job.seenAt) markSeen.mutate(job.id);
    navigate(`/quizzes/${job.quizId}/edit`);
  };

  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-4 py-3', job.status === 'done' && !job.seenAt && 'bg-success-soft/40')}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{job.sourceDocs.map((d) => d.title).join(', ')}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', JOB_TONES[job.status])}>
            {waiting && <LoaderCircle className="h-3 w-3 animate-spin" />}
            {t(`quiz.jobs.status.${job.status}`)}
          </span>
          {t('quiz.questions', { count: job.questionCount })} · {formatDateTime(job.createdAt, i18n.language)}
          {job.requestedBy && <> · {job.requestedBy}</>}
        </p>
        {job.status === 'failed' && job.error && <p className="mt-1 text-xs text-danger">{job.error}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {job.status === 'done' && job.quizId && (
          <Button size="sm" onClick={openQuiz}>
            <FolderOpen className="h-4 w-4" /> {t('quiz.jobs.open')}
          </Button>
        )}
        {/* Quá hạn / lỗi: gợi ý tạo ngay bằng AI nội bộ với đúng tài liệu đó */}
        {(job.status === 'expired' || job.status === 'failed') && (
          <Link to={`/quizzes/new?docs=${docsParam}&mode=local`}>
            <Button size="sm" variant="secondary">
              <Sparkles className="h-4 w-4" /> {t('quiz.jobs.useLocal')}
            </Button>
          </Link>
        )}
        {waiting && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            loading={cancel.isPending}
            onClick={() => cancel.mutate(job.id, { onError: (err) => toast.error(errorMessage(err)) })}
          >
            <X className="h-4 w-4" /> {t('common.cancel')}
          </Button>
        )}
      </div>
    </li>
  );
}

export default function QuizListPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const editor = isEditor(user);
  const mine = useMyQuizzes();
  const managed = useManagedQuizzes(editor);
  useDocumentTitle(t('quiz.title'));

  // ?doc=<id>: mở từ nút "Bài kiểm tra" của một bài viết -> chỉ hiện đề có bài đó làm tài liệu nguồn.
  const [params] = useSearchParams();
  const docFilter = params.get('doc');
  const filterDoc = useQuery({
    queryKey: ['documents', 'id', docFilter],
    queryFn: () => documentsApi.getById(docFilter!),
    enabled: !!docFilter,
    retry: false,
  });
  const ofDoc = <T extends { sourceDocs: { id: string }[] }>(list: T[] | undefined) =>
    docFilter ? (list ?? []).filter((q) => q.sourceDocs.some((d) => d.id === docFilter)) : (list ?? []);
  const myList = ofDoc(mine.data);
  const managedList = ofDoc(managed.data);

  return (
    <div className="mx-auto max-w-form space-y-10 px-4 py-8">
      <section>
        <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
          <ClipboardCheck className="h-6 w-6 text-accent" /> {t('quiz.myQuizzes')}
        </h1>
        {docFilter && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
            <FileText className="h-4 w-4 text-accent" />
            <span className="min-w-0 flex-1">
              {t('quiz.filterByDoc')}{' '}
              {filterDoc.data ? (
                <Link to={`/docs/${filterDoc.data.slug}`} className="font-medium text-accent hover:underline">
                  {filterDoc.data.title}
                </Link>
              ) : (
                '…'
              )}
            </span>
            <Link to="/quizzes" className="text-muted hover:text-fg">
              {t('quiz.showAll')}
            </Link>
          </div>
        )}
        {mine.isPending ? (
          <Spinner />
        ) : mine.error ? (
          <EmptyState icon={ClipboardCheck} title={t('common.error')} description={errorMessage(mine.error)} />
        ) : !myList.length ? (
          <EmptyState
            icon={ClipboardCheck}
            title={docFilter ? t('quiz.emptyForDoc') : t('quiz.emptyMine')}
            action={
              docFilter && editor && filterDoc.data?.status === 'published' ? (
                <Link to={`/quizzes/new?docs=${docFilter}`}>
                  <Button size="sm">
                    <Sparkles className="h-4 w-4" /> {t('quiz.createFromDoc')}
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div data-tour="quiz-list" className="grid gap-4 sm:grid-cols-2">
            {myList.map((q) => (
              <MyQuizCard key={q.id} quiz={q} />
            ))}
          </div>
        )}
      </section>

      {editor && <QuizJobsSection />}

      {editor && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{t('quiz.manage')}</h2>
            <Link to="/quizzes/new" data-tour="quiz-create">
              <Button>
                <Sparkles className="h-4 w-4" /> {t('quiz.createNew')}
              </Button>
            </Link>
          </div>
          {managed.isPending ? (
            <Spinner />
          ) : !managedList.length ? (
            <EmptyState icon={Sparkles} title={docFilter ? t('quiz.emptyForDoc') : t('quiz.emptyManage')} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {managedList.map((q) => (
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
        ) : q.mustRead ? (
          // Chưa đọc đủ thời gian bài nguồn -> khóa, chỉ link tới bài cần đọc.
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-1.5 text-warning">
              <Lock className="h-4 w-4" /> {t('quiz.blocked.must_read')}
            </p>
            {q.mustRead.map((d) => (
              <Link key={d.id} to={`/docs/${d.slug}`} className="block truncate text-accent hover:underline">
                📄 {d.title}
              </Link>
            ))}
          </div>
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
            <Link to={`/quizzes/${q.id}/results`} title={t('quiz.results')} data-tour="quiz-results">
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
