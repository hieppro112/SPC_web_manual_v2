// ============================================================
// QuizCreatePage — tạo bài kiểm tra bằng AI  (/quizzes/new?docs=5,8)
// ============================================================
// Bước 1: chọn tài liệu nguồn + số câu + ngôn ngữ -> "Tạo đề"
// Bước 2: AI ra đề (stream tiến độ "4/10 câu") -> chuyển sang QuizEditor
//         để editor đọc lại, sửa, rồi mới lưu.

import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search, Sparkles, X } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import { errorMessage, removeDiacritics } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useDocuments } from '../documents/queries.ts';
import { quizzesApi, type QuizInput, type QuizLang } from './api.ts';
import QuizEditor from './QuizEditor.tsx';

const COUNTS = [5, 10, 15, 20];
const LANGS: QuizLang[] = ['vi', 'en', 'ja'];

export default function QuizCreatePage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  useDocumentTitle(t('quiz.generateTitle'));

  const { data: docs } = useDocuments({ status: 'published' });
  const [selected, setSelected] = useState<string[]>(() => (params.get('docs') ?? '').split(',').filter(Boolean));
  const [filter, setFilter] = useState('');
  const [count, setCount] = useState(10);
  const [language, setLanguage] = useState<QuizLang>(() => (LANGS.includes(i18n.language as QuizLang) ? (i18n.language as QuizLang) : 'vi'));

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState<QuizInput | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const needle = removeDiacritics(filter.trim());
  const shownDocs = (docs ?? []).filter((d) => !needle || removeDiacritics(d.title).includes(needle));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 10 ? s : [...s, id]));

  const generate = async () => {
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
          else if (event.type === 'result') {
            const titles = event.sourceDocs.map((d) => d.title);
            setGenerated({
              title: titles.length === 1 ? titles[0] : `${titles[0]} (+${titles.length - 1})`,
              kind: 'practice',
              status: 'draft',
              language,
              questions: event.questions,
              sourceDocs: event.sourceDocs,
              passPercent: 85,
              maxAttempts: 3,
              dueAt: null,
              assigneeIds: [],
            });
          }
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

  // Có đề rồi -> trình sửa đề (chưa lưu).
  if (generated) return <QuizEditor initial={generated} />;

  const busy = progress !== null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/quizzes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t('quiz.title')}
      </Link>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <Sparkles className="h-6 w-6 text-accent" /> {t('quiz.generateTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('quiz.typesHint')}</p>

      <section className="space-y-5 rounded-2xl border border-border bg-surface p-4">
        {/* Tài liệu nguồn */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {t('quiz.sourceDocs')} <span className="font-normal text-muted">· {t('quiz.sourceDocsHint')}</span>
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('quiz.searchDocs')} className="h-8 w-56 pl-8 text-sm" />
            </div>
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                  {docs?.find((d) => d.id === id)?.title ?? `#${id}`}
                  <button type="button" onClick={() => toggle(id)} disabled={busy} aria-label={t('common.delete')}>
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

        {busy ? (
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
          <Button onClick={generate} disabled={!selected.length}>
            <Sparkles className="h-4 w-4" /> {t('quiz.generate')}
          </Button>
        )}
      </section>
    </div>
  );
}
