// ============================================================
// GuidePage — Hướng dẫn & thực hành  (/guide)
// ============================================================
//   ┌ Tour giới thiệu / Tour trình soạn thảo ──────────────┐
//   ├ Nhiệm vụ thực hành (thanh tiến độ, "Chỉ cho tôi")    │  đã đăng nhập
//   ├ Bài hướng dẫn (theo ngôn ngữ giao diện)              │  ai cũng xem
//   └ Admin: nạp bài mẫu + tiến độ của mọi người          ┘
// Nhiệm vụ tự đánh dấu khi làm đúng việc ở trang khác (xem useCompleteTask).

import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BookOpen, CircleCheck, Circle, Compass, Download, GraduationCap, LogIn, Play, RotateCcw, SquarePen } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { isEditor } from '../../lib/types.ts';
import { cn, errorMessage, formatDate, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCurrentUser } from '../auth/queries.ts';
import type { GuideDoc, GuideGroup } from './api.ts';
import { useGuideDocs, useGuideProgress, useGuideReport, useResetGuide, useSeedGuide } from './queries.ts';
import { TASK_META, type TaskKey } from './tasks.ts';
import { useTour } from './tour/context.ts';

const GROUPS: GuideGroup[] = ['basic', 'editor', 'admin'];

export default function GuidePage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('guide.title'));
  const user = useCurrentUser();
  const tour = useTour();
  const docs = useGuideDocs(i18n.language);
  const guideDocs = docs.data?.docs ?? [];

  return (
    <div className="mx-auto max-w-form space-y-8 px-4 py-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <GraduationCap className="h-7 w-7 text-accent" /> {t('guide.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('guide.subtitle')}</p>
      </header>

      {/* Tour */}
      <section className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-4">
        <Compass className="mt-1.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('guide.toursTitle')}</h2>
          <p className="text-sm text-muted">{t('guide.toursHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => tour.startTour('main')}>
            <Play className="h-4 w-4" /> {t('guide.mainTour')}
          </Button>
          {isEditor(user) && (
            <Button size="sm" variant="secondary" onClick={() => tour.startTour('editor')}>
              <SquarePen className="h-4 w-4" /> {t('guide.editorTour')}
            </Button>
          )}
        </div>
      </section>

      {user ? (
        <Missions guideDocs={guideDocs} />
      ) : (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border p-4">
          <p className="min-w-0 flex-1 text-sm text-muted">{t('guide.loginForMissions')}</p>
          <Link to="/login">
            <Button size="sm" variant="secondary">
              <LogIn className="h-4 w-4" /> {t('nav.login')}
            </Button>
          </Link>
        </section>
      )}

      {/* Bài hướng dẫn */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-accent" /> {t('guide.docsTitle')}
        </h2>
        {docs.isPending ? (
          <Spinner />
        ) : guideDocs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            {user?.role === 'admin' ? t('guide.noDocsAdmin') : t('guide.noDocs')}
          </p>
        ) : (
          <ol data-tour="guide-docs" className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {guideDocs.map((doc) => (
              <li key={doc.id}>
                <Link to={`/docs/${doc.slug}`} className="block px-4 py-3 hover:bg-surface-2">
                  <p className="font-medium">{doc.title}</p>
                  {doc.desc && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{doc.desc}</p>}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {user?.role === 'admin' && (
        <>
          <SeedPanel />
          <ProgressReport />
        </>
      )}
    </div>
  );
}

// ---------- Nhiệm vụ thực hành ----------

function Missions({ guideDocs }: { guideDocs: GuideDoc[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const tour = useTour();
  const { data, isPending, error } = useGuideProgress();
  const reset = useResetGuide();

  if (isPending) return <Spinner />;
  if (error || !data) {
    return <p className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">{errorMessage(error)}</p>;
  }

  const doneCount = data.tasks.filter((task) => data.done[task.key]).length;
  const percent = data.tasks.length ? Math.round((doneCount / data.tasks.length) * 100) : 0;

  // "Chỉ cho tôi": mở đúng trang + khoanh chỗ cần bấm (hoặc chạy tour / chỉ mở trang).
  const showMe = (key: TaskKey) => {
    const meta: { route?: string | null; target?: string; tour?: 'main' | 'editor'; visit?: boolean } = TASK_META[key];
    if (meta.tour) return tour.startTour(meta.tour);
    if (meta.visit && meta.route) return navigate(meta.route);
    // 'doc' = cần một tài liệu để thao tác -> dùng bài hướng dẫn đầu tiên (chưa có thì về trang chủ).
    let route = meta.route;
    let target = meta.target;
    if (route === 'doc') {
      route = guideDocs[0] ? `/docs/${guideDocs[0].slug}` : '/';
      if (!guideDocs[0]) target = 'doc-list';
    }
    tour.showHint({ title: t(`guide.tasks.${key}.title`), body: t(`guide.tasks.${key}.hint`), route, target, task: key });
  };

  return (
    <section className="rounded-2xl border border-border">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-semibold">{t('guide.missionsTitle')}</h2>
          <span className="text-sm font-medium">{t('guide.progress', { done: doneCount, total: data.tasks.length })}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm text-muted">{doneCount === data.tasks.length ? t('guide.allDone') : t('guide.missionsHint')}</p>
      </div>

      {GROUPS.map((group) => {
        const tasks = data.tasks.filter((task) => task.group === group);
        if (!tasks.length) return null;
        return (
          <div key={group}>
            <h3 className="bg-surface px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">{t(`guide.groups.${group}`)}</h3>
            <ul className="divide-y divide-border">
              {tasks.map(({ key }) => {
                const doneAt = data.done[key];
                const Icon = TASK_META[key].icon;
                return (
                  <li key={key} className={cn('flex items-center gap-3 px-4 py-3', doneAt && 'bg-success-soft/30')}>
                    {doneAt ? <CircleCheck className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-muted/50" />}
                    <Icon className="h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-medium', doneAt && 'text-muted line-through decoration-success/60')}>{t(`guide.tasks.${key}.title`)}</p>
                      <p className="text-xs text-muted">
                        {doneAt ? t('guide.doneAt', { date: formatDateTime(doneAt, i18n.language) }) : t(`guide.tasks.${key}.desc`)}
                      </p>
                    </div>
                    {!doneAt && (
                      <Button size="sm" variant="secondary" onClick={() => showMe(key)}>
                        {'tour' in TASK_META[key] ? t('guide.startTour') : 'visit' in TASK_META[key] ? t('guide.openPage') : t('guide.showMe')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {doneCount > 0 && (
        <div className="border-t border-border p-3 text-right">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted"
            loading={reset.isPending}
            onClick={() => {
              if (window.confirm(t('guide.resetConfirm'))) reset.mutate(undefined, { onError: (err) => toast.error(errorMessage(err)) });
            }}
          >
            <RotateCcw className="h-4 w-4" /> {t('guide.reset')}
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------- Admin: nạp bài hướng dẫn mẫu ----------

function SeedPanel() {
  const { t } = useTranslation();
  const seed = useSeedGuide();

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">{t('guide.seedTitle')}</h2>
        <p className="text-sm text-muted">{t('guide.seedHint')}</p>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          loading={seed.isPending}
          onClick={() =>
            seed.mutate(undefined, {
              onSuccess: (r) => toast.success(t('guide.seedDone', { docs: r.createdDocs, quizzes: r.createdQuizzes, skipped: r.skippedDocs + r.skippedQuizzes })),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        >
          <Download className="h-4 w-4" /> {t('guide.seed')}
        </Button>
      </div>
    </section>
  );
}

// ---------- Admin: tiến độ của mọi người ----------

function ProgressReport() {
  const { t, i18n } = useTranslation();
  const { data, isPending, error } = useGuideReport(true);

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{t('guide.reportTitle')}</h2>
      {isPending ? (
        <Spinner />
      ) : error || !data ? (
        <p className="text-sm text-danger">{errorMessage(error)}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t('quiz.colName')}</th>
                <th className="px-4 py-2 font-medium">{t('users.role')}</th>
                <th className="px-4 py-2 font-medium">{t('guide.colProgress')}</th>
                <th className="px-4 py-2 font-medium">{t('guide.colLast')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2">
                    {u.displayName} <span className="text-xs text-muted">@{u.username}</span>
                  </td>
                  <td className="px-4 py-2 text-muted">{t(`users.${u.role}`)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={cn('h-full rounded-full', u.done === u.total ? 'bg-success' : 'bg-accent')}
                          style={{ width: `${u.total ? (u.done / u.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="tabular-nums">
                        {u.done}/{u.total}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted">{u.lastAt ? formatDate(u.lastAt, i18n.language) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
