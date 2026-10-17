// ============================================================
// ImportPage — Nhập bài từ PowerPoint  (/import)
// ============================================================
// 1. Editor chọn file .pptx + thể loại + ngôn ngữ -> tải lên.
//    Web đọc ngay chữ / bảng / ảnh / ghi chú của từng slide (vài giây).
// 2. Yêu cầu vào hàng đợi; worker nhờ Claude dựng bài (vài phút).
// 3. Xong: chấm đỏ trên nút "Nhập PowerPoint" + nút "Mở bài nháp" bên dưới.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileUp, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Select from '../../components/ui/Select.tsx';
import { cn, errorMessage, formatBytes, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import CategoryOptions from '../categories/CategoryOptions.tsx';
import type { QuizLang } from '../quizzes/api.ts';
import { useCategoryTree } from '../categories/queries.ts';
import type { ImportJob, ImportJobStatus, ImportSummary } from './api.ts';
import { useCancelImport, useImportJobs, useMarkImportSeen, useUploadImport } from './queries.ts';

const MAX_MB = 50;
const LANGS: QuizLang[] = ['vi', 'en', 'ja'];

const TONES: Record<ImportJobStatus, string> = {
  pending: 'bg-surface-2 text-muted',
  processing: 'bg-accent-soft text-accent',
  done: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
  expired: 'bg-warning-soft text-warning',
  cancelled: 'bg-surface-2 text-muted',
};

export default function ImportPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('import.title'));
  const { tree } = useCategoryTree();
  const upload = useUploadImport();
  const { data } = useImportJobs();

  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [language, setLanguage] = useState<QuizLang>(() => (LANGS.includes(i18n.language as QuizLang) ? (i18n.language as QuizLang) : 'vi'));
  const [progress, setProgress] = useState<number | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const pickFile = (f: File | undefined) => {
    setSummary(null);
    if (!f) return;
    if (!/\.pptx$/i.test(f.name)) return toast.error(t('import.onlyPptx'));
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(t('import.tooLarge', { mb: MAX_MB }));
    setFile(f);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!file || !categoryId) return;
    upload.mutate(
      { file, categoryId, language, onProgress: setProgress },
      {
        onSuccess: (res) => {
          setSummary(res.summary);
          setFile(null);
          toast.success(t('import.sent'));
        },
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setProgress(null),
      },
    );
  };

  // Tải lên xong 100% nhưng server còn đang đọc file + nén ảnh.
  const uploadLabel = progress === null ? t('import.send') : progress < 100 ? t('import.uploading', { percent: progress }) : t('import.reading');

  return (
    <div className="mx-auto max-w-form space-y-8 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileUp className="h-6 w-6 text-accent" /> {t('import.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('import.subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-4">
        {/* Chọn file: bấm hoặc kéo thả */}
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pickFile(e.dataTransfer.files[0]);
          }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-bg p-6 text-center hover:border-accent/50"
        >
          <Upload className="h-8 w-8 text-muted" />
          {file ? (
            <span className="font-medium">
              {file.name} <span className="text-sm font-normal text-muted">({formatBytes(file.size)})</span>
            </span>
          ) : (
            <span className="text-sm text-muted">{t('import.pick', { mb: MAX_MB })}</span>
          )}
          <input
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('editor.category')}</span>
            <Select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('editor.chooseCategory')}</option>
              <CategoryOptions tree={tree} />
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('import.language')}</span>
            <Select value={language} onChange={(e) => setLanguage(e.target.value as QuizLang)}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`quiz.languages.${l}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <p className="text-xs text-muted">{t('import.hint')}</p>
        <Button type="submit" disabled={!file || !categoryId} loading={upload.isPending}>
          <FileUp className="h-4 w-4" /> {uploadLabel}
        </Button>

        {summary && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-sm">
            {t('import.summary', { slides: summary.slides, images: summary.images, tables: summary.tables, notes: summary.notes })}
            {summary.removedLines.length > 0 && <> {t('import.removed', { lines: summary.removedLines.join(', ') })}</>}
          </p>
        )}
      </form>

      {!!data?.jobs.length && (
        <section>
          <h2 className="mb-1 text-xl font-bold">{t('import.jobsTitle')}</h2>
          <p className="mb-4 text-sm text-muted">{t('quiz.jobs.subtitle', { hours: data.timeoutHours })}</p>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {data.jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function JobRow({ job }: { job: ImportJob }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const cancel = useCancelImport();
  const markSeen = useMarkImportSeen();
  const waiting = job.status === 'pending' || job.status === 'processing';

  const openDoc = () => {
    if (!job.seenAt) markSeen.mutate(job.id);
    navigate(`/docs/${job.documentSlug}/edit`);
  };

  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-4 py-3', job.status === 'done' && !job.seenAt && 'bg-success-soft/40')}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{job.fileName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', TONES[job.status])}>
            {waiting && <LoaderCircle className="h-3 w-3 animate-spin" />}
            {t(`quiz.jobs.status.${job.status}`)}
          </span>
          {t('import.slides', { count: job.slideCount })} · {job.categoryName ?? '—'} · {t(`quiz.languages.${job.language}`)} ·{' '}
          {formatDateTime(job.createdAt, i18n.language)}
          {job.requestedBy && <> · {job.requestedBy}</>}
        </p>
        {job.status === 'failed' && job.error && <p className="mt-1 text-xs text-danger">{job.error}</p>}
      </div>
      <div className="flex gap-1.5">
        {job.status === 'done' && job.documentSlug && (
          <Button size="sm" onClick={openDoc}>
            <FolderOpen className="h-4 w-4" /> {t('import.openDraft')}
          </Button>
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
