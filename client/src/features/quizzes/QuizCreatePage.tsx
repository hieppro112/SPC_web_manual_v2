// ============================================================
// QuizCreatePage — tạo bài kiểm tra  (/quizzes/new?docs=5,8&mode=local)
// ============================================================
// 3 cách tạo đề:
//   claude  — gửi yêu cầu vào HÀNG ĐỢI; quiz-worker (máy có Claude) tạo đề
//             trong vài phút, đề hiện ở "Bài kiểm tra" dạng nháp + chấm đỏ báo
//   local   — AI nội bộ (LM Studio / Ollama) tạo NGAY, có thanh tiến độ
//   manual  — tự soạn từng câu, không dùng AI
// Cả 3 đều kết thúc ở QuizEditor: editor đọc lại, sửa, rồi mới lưu.

import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Bot, PenLine, Search, Send, Sparkles, X, type LucideIcon } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import { cn, errorMessage, newId, removeDiacritics } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useAiStatus } from '../ai/queries.ts';
import { useDocuments } from '../documents/queries.ts';
import { quizzesApi, type QuizInput, type QuizLang, type SourceDoc } from './api.ts';
import { useCreateQuizJob } from './queries.ts';
import QuizEditor from './QuizEditor.tsx';

const COUNTS = [5, 10, 15, 20];
const LANGS: QuizLang[] = ['vi', 'en', 'ja'];
type Mode = 'claude' | 'local' | 'manual';
const MODE_ICONS: Record<Mode, LucideIcon> = { claude: Send, local: Sparkles, manual: PenLine };

// Bộ đề mới với các giá trị mặc định đã chốt (Ôn tập, nháp, đạt 85%, 3 lần).
const blankQuiz = (title: string, language: QuizLang, sourceDocs: SourceDoc[], questions: QuizInput['questions']): QuizInput => ({
  title,
  kind: 'practice',
  status: 'draft',
  language,
  questions,
  sourceDocs,
  passPercent: 85,
  maxAttempts: 3,
  dueAt: null,
  assigneeIds: [],
});

export default function QuizCreatePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useDocumentTitle(t('quiz.generateTitle'));

  const { data: aiStatus } = useAiStatus();
  const { data: docs } = useDocuments({ status: 'published' });
  const createJob = useCreateQuizJob();

  const modes: Mode[] = aiStatus?.enabled ? ['claude', 'local', 'manual'] : ['claude', 'manual'];
  const [mode, setMode] = useState<Mode>(() => (params.get('mode') === 'local' ? 'local' : params.get('mode') === 'manual' ? 'manual' : 'claude'));
  const [selected, setSelected] = useState<string[]>(() => (params.get('docs') ?? '').split(',').filter(Boolean));
  const [filter, setFilter] = useState('');
  const [count, setCount] = useState(10);
  const [language, setLanguage] = useState<QuizLang>(() => (LANGS.includes(i18n.language as QuizLang) ? (i18n.language as QuizLang) : 'vi'));

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<QuizInput | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const needle = removeDiacritics(filter.trim());
  const shownDocs = (docs ?? []).filter((d) => !needle || removeDiacritics(d.title).includes(needle));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 10 ? s : [...s, id]));
  const selectedDocs: SourceDoc[] = selected.map((id) => {
    const d = docs?.find((x) => x.id === id);
    return { id, title: d?.title ?? `#${id}`, slug: d?.slug ?? '' };
  });
  const titleFrom = (list: SourceDoc[]) => (list.length === 0 ? '' : list.length === 1 ? list[0].title : `${list[0].title} (+${list.length - 1})`);

  // ---------- Claude: gửi vào hàng đợi ----------
  const sendToClaude = () =>
    createJob.mutate(
      { docIds: selected, count, language },
      {
        onSuccess: () => {
          toast.success(t('quiz.jobs.sent'));
          navigate('/quizzes');
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );

  // ---------- AI nội bộ: tạo ngay, stream tiến độ ----------
  const generateLocal = async () => {
    setError('');
    setProgress({ done: 0, total: count });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await quizzesApi.generate(
        { docIds: selected, count, language },
        (event) => {
          if (event.type === 'progress') setProgress({ done: event.done, total: event.total });
          else if (event.type === 'error') setError(event.message);
          else if (event.type === 'result') setDraft(blankQuiz(titleFrom(event.sourceDocs), language, event.sourceDocs, event.questions));
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) setError(errorMessage(err));
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  // ---------- Tự soạn: mở trình sửa đề với 1 câu trống ----------
  const startManual = () => {
    const options = [0, 1, 2].map(() => ({ id: newId(), text: '' }));
    setDraft(
      blankQuiz(titleFrom(selectedDocs), language, selectedDocs, [
        { id: newId(), type: 'single', text: '', options, correct: [options[0].id], source: null },
      ]),
    );
  };

  // Có đề rồi (AI nội bộ / tự soạn) -> trình sửa đề (chưa lưu).
  if (draft) return <QuizEditor initial={draft} />;

  const busy = progress !== null || createJob.isPending;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/quizzes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t('quiz.title')}
      </Link>
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold">
        <Bot className="h-6 w-6 text-accent" /> {t('quiz.generateTitle')}
      </h1>

      {/* Chọn cách tạo đề */}
      <div className={cn('mb-5 grid gap-3', modes.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')} role="radiogroup">
        {modes.map((m) => {
          const Icon = MODE_ICONS[m];
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={busy}
              onClick={() => {
                setMode(m);
                setError('');
              }}
              className={cn('rounded-xl border p-3 text-left', mode === m ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50')}
            >
              <p className={cn('flex items-center gap-1.5 font-medium', mode === m && 'text-accent')}>
                <Icon className="h-4 w-4" /> {t(`quiz.modes.${m}`)}
              </p>
              <p className="mt-0.5 text-xs text-muted">{t(`quiz.modeHints.${m}`)}</p>
            </button>
          );
        })}
      </div>

      <section className="space-y-5 rounded-2xl border border-border bg-surface p-4">
        {/* Tài liệu nguồn (bắt buộc với AI, không bắt buộc khi tự soạn) */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {t('quiz.sourceDocs')}{' '}
              <span className="font-normal text-muted">· {mode === 'manual' ? t('quiz.sourceDocsOptional') : t('quiz.sourceDocsHint')}</span>
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('quiz.searchDocs')} className="h-8 w-56 pl-8 text-sm" />
            </div>
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedDocs.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                  {d.title}
                  <button type="button" onClick={() => toggle(d.id)} disabled={busy} aria-label={t('common.delete')}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-bg">
            {shownDocs.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-surface-2">
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} disabled={busy} />
                <span className="flex-1">{d.title}</span>
                {d.category && <span className="text-xs text-muted">{d.category.name}</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {mode !== 'manual' && (
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('quiz.count')}</span>
              <Select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
                {COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('quiz.language')}</span>
            <Select value={language} onChange={(e) => setLanguage(e.target.value as QuizLang)} disabled={busy}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`quiz.languages.${l}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        {mode === 'claude' && (
          <>
            <p className="text-xs text-muted">{t('quiz.jobs.claudeHint')}</p>
            <Button onClick={sendToClaude} disabled={!selected.length} loading={createJob.isPending}>
              <Send className="h-4 w-4" /> {t('quiz.jobs.send')}
            </Button>
          </>
        )}

        {mode === 'local' &&
          (progress ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{t('quiz.generating', { done: progress.done, total: progress.total })}</span>
                <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
                  {t('common.cancel')}
                </Button>
              </div>
              {/* Thanh tiến độ: nhích dần theo số câu AI đã viết xong */}
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(4, (progress.done / progress.total) * 100)}%` }} />
              </div>
              <p className="text-xs text-muted">{t('quiz.generatingHint')}</p>
            </div>
          ) : (
            <Button onClick={generateLocal} disabled={!selected.length}>
              <Sparkles className="h-4 w-4" /> {t('quiz.generate')}
            </Button>
          ))}

        {mode === 'manual' && (
          <Button onClick={startManual}>
            <PenLine className="h-4 w-4" /> {t('quiz.startManual')}
          </Button>
        )}
      </section>
    </div>
  );
}
