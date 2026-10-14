// QuizEditPage — sửa bộ đề đã lưu  (/quizzes/:id/edit)
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { FileQuestionMark } from 'lucide-react';
import { useQuizForEdit } from './queries.ts';
import QuizEditor from './QuizEditor.tsx';

export default function QuizEditPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: quiz, isPending, error } = useQuizForEdit(id);
  useDocumentTitle(quiz?.title);

  if (isPending) return <Spinner className="py-24" />;
  if (error || !quiz) return <EmptyState icon={FileQuestionMark} title={t('common.error')} description={errorMessage(error)} />;

  const { title, kind, status, language, questions, sourceDocs, passPercent, maxAttempts, dueAt, assigneeIds } = quiz;
  // key={quiz.id}: đổi sang đề khác thì trình sửa khởi tạo lại từ đầu.
  return (
    <QuizEditor
      key={quiz.id}
      id={quiz.id}
      initial={{ title, kind, status, language, questions, sourceDocs, passPercent, maxAttempts, dueAt, assigneeIds }}
    />
  );
}
