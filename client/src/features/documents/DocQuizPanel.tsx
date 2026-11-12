// ============================================================
// DocQuizPanel — khối "Bài kiểm tra" nổi bật trên trang đọc
// ============================================================
//   placement="top"  dải màu dưới tiêu đề: nút "Bài kiểm tra" (+ "Tạo bài kiểm tra" cho biên tập)
//   placement="end"  thẻ lớn cuối bài: "Đọc xong rồi? Làm bài kiểm tra"
// Khi nào hiện:
//   - khách: luôn hiện (mời đăng nhập để làm bài)
//   - đã đăng nhập: bài có đề dành cho mình, HOẶC mình là biên tập (để tạo đề)
//   - người dùng thường + bài chưa có đề: ẩn (khỏi hiện một khung "không có gì")

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Lock, Sparkles } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import { cn } from '../../lib/utils.ts';
import QuizEntryButton from '../reading/QuizEntryButton.tsx';
import { useMyQuizzes } from '../quizzes/queries.ts';

type Props = {
  placement: 'top' | 'end';
  docId: string;
  published: boolean;
  loggedIn: boolean;
  editor: boolean;
  locked: boolean;
};

export default function DocQuizPanel({ placement, docId, published, loggedIn, editor, locked }: Props) {
  const { t } = useTranslation();
  // Cùng query key với trang "Bài kiểm tra của tôi" -> 2 panel trên trang chỉ tải 1 lần.
  const mine = useMyQuizzes(loggedIn);
  const count = (mine.data ?? []).filter((q) => q.sourceDocs.some((d) => d.id === docId)).length;

  if (loggedIn && mine.isPending) return null;
  if (loggedIn && !count && !editor) return null;
  const canCreate = editor && published;
  if (loggedIn && !count && !canCreate) return null;

  const hint = !loggedIn
    ? t('reading.loginHint')
    : locked
      ? t('reading.lockedHint')
      : count
        ? t('doc.quizPanel.has', { count })
        : t('doc.quizPanel.none');

  const createButton = canCreate && (
    <Link to={`/quizzes/new?docs=${docId}`}>
      <Button size={placement === 'end' ? 'md' : 'sm'} variant="secondary" className="border-accent/40 text-accent hover:bg-accent-soft">
        <Sparkles className="h-4 w-4" /> {t('quiz.createFromDoc')}
      </Button>
    </Link>
  );
  const takeButton = (!loggedIn || count > 0) && (
    <QuizEntryButton docId={docId} loggedIn={loggedIn} locked={locked} size={placement === 'end' ? 'md' : 'sm'} count={count} />
  );

  if (placement === 'top') {
    return (
      <div className="no-print mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('doc.quizPanel.title')}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            {locked && <Lock className="h-3 w-3" />} {hint}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {takeButton}
          {createButton}
        </div>
      </div>
    );
  }

  // Cuối bài: người đọc vừa đọc hết -> lúc dễ bấm "làm bài" nhất.
  const onlyCreate = !takeButton;
  return (
    <section
      className={cn(
        'no-print mt-12 overflow-hidden rounded-2xl border p-6 sm:flex sm:items-center sm:gap-6',
        onlyCreate ? 'border-border bg-surface' : 'border-accent/30 bg-gradient-to-br from-accent-soft to-surface',
      )}
    >
      <span className="mb-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg sm:mb-0">
        <GraduationCap className="h-7 w-7" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-bold">{onlyCreate ? t('doc.quizPanel.none') : t('doc.quizPanel.endTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{onlyCreate ? t('doc.quizPanel.endBodyEditor') : locked ? t('reading.lockedHint') : t('doc.quizPanel.endBody')}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
        {takeButton}
        {createButton}
      </div>
    </section>
  );
}
