// ============================================================
// QuizEditor — editor xem / sửa đề (AI tạo hoặc đã lưu) rồi lưu
// ============================================================
// Giống trình soạn tài liệu: cả bộ đề nằm trong MỘT state `draft`; "chưa
// lưu" = draft khác bản đã lưu. Sửa gì cũng tạo object/mảng MỚI.
//
//   Cài đặt: tên, Ôn tập / Kiểm tra, Nháp / Xuất bản, điểm đạt,
//            số lần làm + hạn chót + giao cho ai (chỉ bài Kiểm tra)
//   Câu hỏi: sửa chữ, đổi loại, đánh dấu đáp án đúng, thêm / xóa / đổi thứ tự
//   "Làm thử": làm bài ngay bằng đề đang sửa (chấm trên máy, không lưu)

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, Play, Plus, Save, Search, Trash } from 'lucide-react';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import Button from '../../components/ui/Button.tsx';
import Dialog from '../../components/ui/Dialog.tsx';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import { cn, errorMessage, newId, removeDiacritics } from '../../lib/utils.ts';
import { useUnsavedGuard } from '../editor/useUnsavedGuard.ts';
import { useCompleteTask } from '../guide/queries.ts';
import type { QuestionType, QuizInput, QuizLang, QuizQuestion } from './api.ts';
import { useAssignableUsers, useSaveQuiz } from './queries.ts';
import QuizRunner, { gradeLocally } from './QuizRunner.tsx';

// Phải giống server/src/services/quiz/types.ts
export const TRUE_FALSE: Record<QuizLang, [string, string]> = {
  vi: ['Đúng', 'Sai'],
  en: ['True', 'False'],
  ja: ['正しい', '誤り'],
};

const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'truefalse'];

// <input type="datetime-local"> dùng giờ máy, không có múi giờ <-> ISO (UTC) cho server.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

// Kiểm tra giống luật ở server -> báo lỗi rõ "Câu 3: ..." trước khi gửi.
function validate(draft: QuizInput, t: TFunction): string | null {
  if (!draft.title.trim()) return t('quiz.errors.title');
  if (!draft.questions.length) return t('quiz.errors.noQuestions');
  for (const [i, q] of draft.questions.entries()) {
    const n = i + 1;
    if (!q.text.trim()) return t('quiz.errors.text', { n });
    if (q.options.some((o) => !o.text.trim())) return t('quiz.errors.option', { n });
    if (new Set(q.options.map((o) => o.text.trim())).size !== q.options.length) return t('quiz.errors.duplicate', { n });
    if (q.type !== 'multiple' && q.correct.length !== 1) return t('quiz.errors.single', { n });
    if (q.type === 'multiple' && q.correct.length < 2) return t('quiz.errors.multiple', { n });
  }
  return null;
}

type Props = { id?: string; initial: QuizInput };

export default function QuizEditor({ id, initial }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const save = useSaveQuiz();
  const complete = useCompleteTask();
  const [draft, setDraft] = useState<QuizInput>(() => initial);
  const [savedJson, setSavedJson] = useState(() => (id ? JSON.stringify(initial) : ''));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const dirty = useMemo(() => JSON.stringify(draft) !== savedJson, [draft, savedJson]);
  const { allowNextNavigation } = useUnsavedGuard(dirty, t('editor.leaveConfirm'));
  const exam = draft.kind === 'exam';

  const set = (patch: Partial<QuizInput>) => setDraft((d) => ({ ...d, ...patch }));
  const setQuestion = (qid: string, change: (q: QuizQuestion) => QuizQuestion) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((q) => (q.id === qid ? change(q) : q)) }));
  const moveQuestion = (index: number, delta: number) =>
    setDraft((d) => {
      const to = index + delta;
      if (to < 0 || to >= d.questions.length) return d;
      const list = [...d.questions];
      [list[index], list[to]] = [list[to], list[index]];
      return { ...d, questions: list };
    });
  const removeQuestion = (qid: string) => setDraft((d) => ({ ...d, questions: d.questions.filter((q) => q.id !== qid) }));
  const addQuestion = () =>
    setDraft((d) => {
      const options = [0, 1, 2].map(() => ({ id: newId(), text: '' }));
      return { ...d, questions: [...d.questions, { id: newId(), type: 'single', text: '', options, correct: [options[0].id], source: null }] };
    });

  const onSave = async () => {
    const error = validate(draft, t);
    if (error) {
      toast.error(error);
      return;
    }
    try {
      const saved = await save.mutateAsync({ id, data: draft });
      setSavedJson(JSON.stringify(draft));
      toast.success(t('quiz.saved'));
      complete('createQuiz');
      if (!id) {
        // Đề mới: sang URL sửa của chính nó, lần lưu sau là "sửa".
        allowNextNavigation();
        navigate(`/quizzes/${saved.id}/edit`, { replace: true });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const openPreview = () => {
    const error = validate(draft, t);
    if (error) {
      toast.error(error);
      return;
    }
    setPreviewKey((k) => k + 1); // key mới -> QuizRunner làm lại từ đầu
    setPreviewOpen(true);
  };

  return (
    <div className="mx-auto max-w-form px-4 py-6">
      {/* Thanh công cụ */}
      <div className="sticky top-14 z-30 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur">
        <Link to="/quizzes" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title={t('common.back')}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {id ? t('quiz.editQuiz') : t('quiz.newQuiz')}
          <span className={cn('ml-2 text-xs font-normal', dirty ? 'text-warning' : 'text-muted')}>
            {dirty ? `● ${t('editor.unsaved')}` : t('editor.allSaved')}
          </span>
        </span>
        <Button variant="secondary" onClick={openPreview}>
          <Play className="h-4 w-4" /> {t('quiz.preview')}
        </Button>
        <Button onClick={onSave} loading={save.isPending}>
          <Save className="h-4 w-4" /> {t('quiz.save')}
        </Button>
      </div>

      {!id && <p className="mb-5 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">{t('quiz.aiWarning')}</p>}

      {/* ---------- Cài đặt ---------- */}
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
        <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('quiz.name')} className="text-lg font-semibold" />

        <div className="grid gap-3 sm:grid-cols-2">
          {(['practice', 'exam'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => set({ kind })}
              className={cn(
                'rounded-xl border p-3 text-left',
                draft.kind === kind ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50',
              )}
            >
              <p className={cn('font-medium', draft.kind === kind && 'text-accent')}>{t(`quiz.kind.${kind}`)}</p>
              <p className="text-xs text-muted">{t(`quiz.kindHint.${kind}`)}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('quiz.statusLabel')}</span>
            <Select value={draft.status} onChange={(e) => set({ status: e.target.value === 'published' ? 'published' : 'draft' })}>
              <option value="draft">{t('quiz.status.draft')}</option>
              <option value="published">{t('quiz.status.published')}</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('quiz.passPercent')}</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={draft.passPercent}
              onChange={(e) => set({ passPercent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </label>
          {exam && (
            <>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('quiz.maxAttempts')}</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.maxAttempts}
                  onChange={(e) => set({ maxAttempts: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('quiz.dueAt')}</span>
                <Input type="datetime-local" value={toLocalInput(draft.dueAt)} onChange={(e) => set({ dueAt: fromLocalInput(e.target.value) })} />
              </label>
            </>
          )}
        </div>

        {exam && <AssigneePicker value={draft.assigneeIds} onChange={(assigneeIds) => set({ assigneeIds })} />}

        {draft.sourceDocs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t('quiz.sourceDocs')}:</span>
            {draft.sourceDocs.map((d) => (
              <Link key={d.id} to={`/docs/${d.slug}`} target="_blank" className="inline-flex items-center gap-1 text-accent hover:underline">
                <BookOpen className="h-3.5 w-3.5" /> {d.title}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Câu hỏi ---------- */}
      <ol className="mt-6 space-y-4">
        {draft.questions.map((q, index) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={index}
            total={draft.questions.length}
            lang={draft.language}
            onChange={(change) => setQuestion(q.id, change)}
            onMove={(delta) => moveQuestion(index, delta)}
            onRemove={() => removeQuestion(q.id)}
          />
        ))}
      </ol>
      <Button variant="secondary" className="mt-4" onClick={addQuestion} disabled={draft.questions.length >= 50}>
        <Plus className="h-4 w-4" /> {t('quiz.addQuestion')}
      </Button>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title={`${t('quiz.preview')}: ${draft.title}`} className="max-w-3xl">
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          {previewOpen && (
            <QuizRunner
              key={previewKey}
              questions={draft.questions}
              onSubmit={async (answers) => gradeLocally(draft.questions, answers, draft.passPercent)}
              onRetry={() => setPreviewKey((k) => k + 1)}
              sourceInNewTab
            />
          )}
        </div>
      </Dialog>
    </div>
  );
}

// ---------- Một câu hỏi ----------

type CardProps = {
  question: QuizQuestion;
  index: number;
  total: number;
  lang: QuizLang;
  onChange: (change: (q: QuizQuestion) => QuizQuestion) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
};

function QuestionCard({ question: q, index, total, lang, onChange, onMove, onRemove }: CardProps) {
  const { t } = useTranslation();

  // Đổi loại câu: chỉnh lại đáp án cho hợp luật của loại mới.
  const changeType = (type: QuestionType) =>
    onChange((prev) => {
      if (type === 'truefalse') {
        const options = TRUE_FALSE[lang].map((text) => ({ id: newId(), text }));
        return { ...prev, type, options, correct: [options[0].id] };
      }
      // Từ Đúng/Sai sang câu 3 đáp án: thêm 1 ô trống.
      const options = prev.type === 'truefalse' ? [...prev.options.map((o) => ({ ...o, text: '' })), { id: newId(), text: '' }] : prev.options;
      const correct = type === 'single' ? prev.correct.slice(0, 1) : prev.correct;
      return { ...prev, type, options, correct: correct.length ? correct : [options[0].id] };
    });

  const toggleCorrect = (optionId: string) =>
    onChange((prev) => {
      if (prev.type !== 'multiple') return { ...prev, correct: [optionId] };
      const has = prev.correct.includes(optionId);
      return { ...prev, correct: has ? prev.correct.filter((c) => c !== optionId) : [...prev.correct, optionId] };
    });

  return (
    <li className="rounded-2xl border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t('quiz.questionN', { n: index + 1 })}</span>
        <Select value={q.type} onChange={(e) => changeType(e.target.value as QuestionType)} className="h-8 w-auto text-sm" aria-label={t('quiz.typeLabel')}>
          {QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`quiz.type.${type}`)}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <Button size="icon" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} title={t('quiz.moveUp')}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onMove(1)} disabled={index === total - 1} title={t('quiz.moveDown')}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="text-danger" onClick={onRemove} title={t('quiz.removeQuestion')}>
          <Trash className="h-4 w-4" />
        </Button>
      </div>

      <AutoTextarea value={q.text} onChange={(e) => onChange((prev) => ({ ...prev, text: e.target.value }))} placeholder={t('quiz.questionPlaceholder')} />

      <div className="mt-3 space-y-2">
        {q.options.map((o, i) => {
          const correct = q.correct.includes(o.id);
          return (
            <div key={o.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleCorrect(o.id)}
                title={t('quiz.markCorrect')}
                aria-pressed={correct}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center border-2',
                  q.type === 'multiple' ? 'rounded-md' : 'rounded-full',
                  correct ? 'border-success bg-success text-white' : 'border-border text-transparent hover:border-success/60',
                )}
              >
                <Check className="h-4 w-4" />
              </button>
              <Input
                value={o.text}
                // Đúng / Sai: chữ cố định theo ngôn ngữ đề, không cho sửa.
                readOnly={q.type === 'truefalse'}
                onChange={(e) => onChange((prev) => ({ ...prev, options: prev.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) }))}
                placeholder={t('quiz.optionPlaceholder', { n: i + 1 })}
                className={cn(correct && 'border-success/60')}
              />
            </div>
          );
        })}
      </div>

      {q.source && (
        <Link to={q.source.url} target="_blank" className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-accent">
          <BookOpen className="h-3.5 w-3.5" /> {t('quiz.source')}: {q.source.title}
          {q.source.url.includes('#') && ` › #${q.source.url.split('#')[1]}`}
        </Link>
      )}
    </li>
  );
}

// ---------- Chọn người được giao bài ----------

function AssigneePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const { data: users } = useAssignableUsers();
  const [filter, setFilter] = useState('');
  const selected = new Set(value);
  const needle = removeDiacritics(filter.trim());
  const shown = (users ?? []).filter((u) => !needle || removeDiacritics(`${u.displayName} ${u.username}`).includes(needle));

  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {t('quiz.assignees')} <span className="font-normal text-muted">· {t('quiz.selectedCount', { count: value.length })}</span>
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('quiz.searchUsers')} className="h-8 w-56 pl-8 text-sm" />
        </div>
      </div>
      <p className="text-xs text-muted">{t('quiz.assigneesHint')}</p>
      <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-bg">
        {shown.map((u) => (
          <label key={u.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0 hover:bg-surface-2">
            <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
            <span className="flex-1">{u.displayName}</span>
            <span className="font-mono text-xs text-muted">@{u.username}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
