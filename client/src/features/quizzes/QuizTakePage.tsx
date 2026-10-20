// ============================================================
// QuizTakePage — làm bài  (/quizzes/:id)
// ============================================================
// Server gửi đề ĐÃ XÁO và KHÔNG có đáp án; nộp bài thì server chấm và trả
// đáp án đúng + link về mục tài liệu. "Làm lại" = xin đề mới (xáo lại).

import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarClock, FileQuestionMark, Lock } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { errorMessage, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCompleteTask } from '../guide/queries.ts';
import { useSubmitQuiz, useTakeQuiz } from './queries.ts';
import QuizRunner from './QuizRunner.tsx';

export default function QuizTakePage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { data, isPending, error, refetch, dataUpdatedAt } = useTakeQuiz(id);
  const submit = useSubmitQuiz(id);
  const complete = useCompleteTask();
  useDocumentTitle(data?.quiz.title);

  if (isPending) return <Spinner className="py-24" />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState icon={FileQuestionMark} title={t('common.error')} description={errorMessage(error)} />
      </div>
    );
  }

  const { quiz, records, attemptsUsed, blocked } = data;
  const left = quiz.maxAttempts - attemptsUsed;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/quizzes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t('quiz.backToList')}
      </Link>

      <header className="mb-6 space-y-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={quiz.kind === 'exam' ? 'accent' : 'neutral'}>{t(`quiz.kind.${quiz.kind}`)}</Badge>
          {quiz.status === 'draft' && <Badge tone="warning">{t('quiz.status.draft')}</Badge>}
        </div>
        <h1 className="text-2xl font-bold">{quiz.title}</h1>
        <p className="text-sm text-muted">{t('quiz.info', { count: data.questions.length, percent: quiz.passPercent })}</p>
        {quiz.dueAt && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CalendarClock className="h-4 w-4" /> {t('quiz.due', { date: formatDateTime(quiz.dueAt, i18n.language) })}
          </p>
        )}
        <p className="text-sm">{records ? t('quiz.examNote', { left: Math.max(0, left) }) : t('quiz.practiceNote')}</p>
      </header>

      {blocked ? (
        <EmptyState
          icon={Lock}
          title={t(`quiz.blocked.${blocked}`)}
          description={blocked === 'must_read' ? t('quiz.mustReadHint') : undefined}
          action={
            // Chưa đọc đủ thời gian: link tới (các) bài nguồn cần đọc.
            data.mustRead?.length ? (
              <div className="flex flex-col items-center gap-1.5">
                {data.mustRead.map((d) => (
                  <Link key={d.id} to={`/docs/${d.slug}`} className="text-accent hover:underline">
                    📄 {d.title}
                  </Link>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : (
        <QuizRunner
          // Xin đề mới (dataUpdatedAt đổi) -> QuizRunner làm lại từ đầu.
          key={dataUpdatedAt}
          questions={data.questions}
          onSubmit={async (answers) => {
            const result = await submit.mutateAsync(answers);
            complete('takeQuiz');
            return result;
          }}
          // Còn lượt (hoặc bài ôn tập) thì cho làm lại; server xáo đề mới.
          onRetry={!records || left > 1 ? () => void refetch() : undefined}
        />
      )}
    </div>
  );
}
