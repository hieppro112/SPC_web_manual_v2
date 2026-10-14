// ============================================================
// QuizRunner — làm bài + xem kết quả (dùng chung)
// ============================================================
// Dùng ở 2 chỗ:
//   • QuizTakePage: onSubmit gửi bài lên server chấm (người làm KHÔNG có đáp án)
//   • "Làm thử" trong QuizEditor: onSubmit tự chấm ngay trên máy (editor đã có đáp án)
// Component không biết chấm ở đâu — chỉ gọi onSubmit và hiện kết quả trả về.
// 🔸 Flutter: giống truyền callback `Future<Result> Function(Answers)` vào widget.

import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BookOpen, Check, CircleCheck, CircleX, RotateCcw, Send } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import { cn, errorMessage } from '../../lib/utils.ts';
import type { Answers, QuizQuestion, SubmitResult, TakeQuestion } from './api.ts';

type Props = {
  questions: TakeQuestion[];
  onSubmit: (answers: Answers) => Promise<SubmitResult>;
  // Làm lại: undefined = không cho làm lại (hết lượt / hết hạn)
  onRetry?: () => void;
  // Trong hộp thoại "Làm thử": link nguồn mở tab mới để không mất đề đang sửa.
  sourceInNewTab?: boolean;
};

export default function QuizRunner({ questions, onSubmit, onRetry, sourceInNewTab }: Props) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = questions.filter((q) => answers[q.id]?.length).length;

  const choose = (q: TakeQuestion, optionId: string) => {
    if (result) return; // đã nộp -> khóa
    setAnswers((prev) => {
      const current = prev[q.id] ?? [];
      // Nhiều đáp án: bật/tắt từng ô. Một đáp án / Đúng-Sai: thay luôn.
      const next = q.type === 'multiple' ? (current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]) : [optionId];
      return { ...prev, [q.id]: next };
    });
  };

  const submit = async () => {
    const missing = questions.length - answeredCount;
    if (missing > 0 && !window.confirm(t('quiz.submitConfirm', { count: missing }))) return;
    setSubmitting(true);
    try {
      setResult(await onSubmit(answers));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const byId = new Map(result?.results.map((r) => [r.questionId, r]));

  return (
    <div className="space-y-5">
      {result && (
        <section
          className={cn(
            'rounded-2xl border p-5 text-center',
            result.passed ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft',
          )}
        >
          <p className="text-sm text-muted">{t('quiz.resultTitle')}</p>
          <p className={cn('mt-1 text-4xl font-bold', result.passed ? 'text-success' : 'text-danger')}>{result.percentage}%</p>
          <p className="mt-1 font-medium">
            {t('quiz.score', { score: result.score, total: result.total })} ·{' '}
            {result.passed ? t('quiz.passed') : t('quiz.failed')} ({t('quiz.passAt', { percent: result.passPercent })})
          </p>
          <p className="mt-1 text-sm text-muted">
            {result.recorded ? t('quiz.attemptsLeft', { count: result.attemptsLeft ?? 0 }) : t('quiz.notRecorded')}
          </p>
          {onRetry && (
            <Button className="mt-3" variant="secondary" onClick={onRetry}>
              <RotateCcw className="h-4 w-4" /> {t('quiz.retake')}
            </Button>
          )}
        </section>
      )}

      <ol className="space-y-4">
        {questions.map((q, index) => {
          const r = byId.get(q.id);
          const chosen = answers[q.id] ?? [];
          return (
            <li
              key={q.id}
              className={cn(
                'avoid-break rounded-2xl border p-4',
                r ? (r.isCorrect ? 'border-success/50' : 'border-danger/50') : 'border-border',
              )}
            >
              <div className="mb-3 flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-sm font-semibold text-muted">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium whitespace-pre-line">{q.text}</p>
                  <p className="mt-0.5 text-xs text-muted">{q.type === 'multiple' ? t('quiz.chooseMany') : t('quiz.chooseOne')}</p>
                </div>
                {r && (r.isCorrect ? <CircleCheck className="h-5 w-5 shrink-0 text-success" /> : <CircleX className="h-5 w-5 shrink-0 text-danger" />)}
              </div>

              <div className="space-y-2">
                {q.options.map((o) => {
                  const picked = chosen.includes(o.id);
                  const isRight = r?.correct.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role={q.type === 'multiple' ? 'checkbox' : 'radio'}
                      aria-checked={picked}
                      onClick={() => choose(q, o.id)}
                      disabled={!!result}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:cursor-default',
                        !r && (picked ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50'),
                        // Sau khi nộp: đáp án đúng tô xanh, đáp án chọn sai tô đỏ.
                        r && isRight && 'border-success bg-success-soft',
                        r && !isRight && picked && 'border-danger bg-danger-soft',
                        r && !isRight && !picked && 'border-border opacity-70',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center border-2',
                          q.type === 'multiple' ? 'rounded' : 'rounded-full',
                          picked ? 'border-accent bg-accent text-accent-fg' : 'border-border',
                        )}
                      >
                        {picked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1">{o.text}</span>
                      {r && isRight && <Badge className="bg-success-soft text-success">{t('quiz.correctAnswer')}</Badge>}
                    </button>
                  );
                })}
              </div>

              {r && !r.isCorrect && r.source && (
                <Link
                  to={r.source.url}
                  target={sourceInNewTab ? '_blank' : undefined}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <BookOpen className="h-4 w-4" /> {t('quiz.reviewSource')}: {r.source.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {!result && (
        // Thanh nộp bài dính dưới đáy màn hình: làm tới đâu cũng thấy tiến độ.
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm text-muted">{t('quiz.answered', { done: answeredCount, total: questions.length })}</span>
          <Button onClick={submit} loading={submitting} disabled={!questions.length}>
            <Send className="h-4 w-4" /> {t('quiz.submit')}
          </Button>
        </div>
      )}
    </div>
  );
}

// "Làm thử" của editor: chấm ngay trên máy bằng đáp án có sẵn (không gọi server, không lưu).
export function gradeLocally(questions: QuizQuestion[], answers: Answers, passPercent: number): SubmitResult {
  const results = questions.map((q) => {
    const chosen = answers[q.id] ?? [];
    const isCorrect = chosen.length === q.correct.length && q.correct.every((c) => chosen.includes(c));
    return { questionId: q.id, chosen, correct: q.correct, isCorrect, source: q.source };
  });
  const score = results.filter((r) => r.isCorrect).length;
  const percentage = questions.length ? Math.round((score / questions.length) * 100) : 0;
  return { score, total: questions.length, percentage, passed: percentage >= passPercent, passPercent, recorded: false, attemptsUsed: 0, attemptsLeft: null, results };
}
