// ============================================================
// DocPage — trang đọc một tài liệu  (/docs/:slug)
// ============================================================
//  ┌────────────┬───────────────────────────┬────────────┐
//  │ Cùng thể   │ breadcrumb, tiêu đề, meta │ Mục lục    │
//  │ loại       │ nút Sửa/Lịch sử/Chia sẻ/In│ (tự sinh)  │
//  │            │ nội dung các khối         │            │
//  └────────────┴───────────────────────────┴────────────┘
// Màn hình nhỏ: hai cột bên ẩn, mục lục thu vào một mục bấm mở.

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronRight, ClipboardCheck, Clock, FileQuestionMark, Pencil, Printer, Share2, Trash } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { computeBlockMeta } from '../../blocks/meta.ts';
import { withDefaults } from '../../blocks/registry.ts';
import { ApiError } from '../../lib/http.ts';
import { cn, errorMessage, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { isEditor } from '../../lib/types.ts';
import { useCurrentUser } from '../auth/queries.ts';
import CategoryIcon from '../categories/CategoryIcon.tsx';
import { useCategories } from '../categories/queries.ts';
import { categoryPath } from '../categories/tree.ts';
import { useCompleteTask } from '../guide/queries.ts';
import { READING_END_ID } from '../reading/api.ts';
import QuizEntryButton from '../reading/QuizEntryButton.tsx';
import { useReadingStatus } from '../reading/queries.ts';
import ReadingTracker from '../reading/ReadingTracker.tsx';
import { LANGS, type Lang } from '../translations/api.ts';
import { useDocTranslation } from '../translations/queries.ts';
import TranslationBar from '../translations/TranslationBar.tsx';
import DocContent from './DocContent.tsx';
import ShareDialog from './ShareDialog.tsx';
import Toc from './Toc.tsx';
import { useDeleteDocument, useDocument, useDocuments } from './queries.ts';

export default function DocPage() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useCurrentUser();
  const editor = isEditor(user);
  const { data: doc, isPending, error } = useDocument(slug);
  const deleteDoc = useDeleteDocument();
  const [shareOpen, setShareOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  // Tài liệu cùng thể loại cho cột trái.
  const { data: siblings } = useDocuments({ category: doc?.category?.id }, !!doc?.category);

  // Đường dẫn thể loại đầy đủ cho breadcrumb: Trang chủ › IT › AI
  const { data: categories } = useCategories();
  const docCategory = doc?.category;
  const categoryTrail = useMemo(() => {
    const trail = categoryPath(categories ?? [], docCategory?.id);
    // Danh sách thể loại chưa tải xong -> tạm hiện mỗi thể loại của tài liệu.
    return trail.length ? trail : docCategory ? [{ id: docCategory.id, name: docCategory.name }] : [];
  }, [categories, docCategory]);

  // useMemo: chỉ tính lại khi `doc` đổi, không tính lại mỗi lần vẽ
  // (vd mỗi lần mở/đóng hộp thoại chia sẻ). 🔸 Flutter: giống cache một
  // giá trị tính toán trong State thay vì tính trong build().
  const blocks = useMemo(() => doc?.blocks.map(withDefaults) ?? [], [doc]);

  // ---------- Bản dịch ----------
  // Ngôn ngữ đọc: ?lang= trên URL (bấm chọn / link chia sẻ), không có thì theo ngôn ngữ giao diện.
  const [params, setParams] = useSearchParams();
  const langParam = params.get('lang');
  const viewLang = (LANGS as string[]).includes(langParam ?? '') ? (langParam as Lang) : ((LANGS as string[]).includes(i18n.language) ? (i18n.language as Lang) : null);
  const translation = useDocTranslation(doc?.id, viewLang);
  const tr = translation.data;
  const showTranslation = !!tr?.available && (tr.status === 'ready' || tr.status === 'partial') && !!tr.blocks;
  const shownBlocks = useMemo(() => (showTranslation ? tr!.blocks!.map(withDefaults) : blocks), [showTranslation, tr, blocks]);
  const shownTitle = showTranslation ? tr!.title! : doc?.title;
  // Bản dịch cùng id khối với bài gốc -> lấy anchor của bài gốc (link "#chuan-bi" dùng chung).
  const { meta, toc } = useMemo(
    () => computeBlockMeta(shownBlocks, doc?.id, showTranslation ? blocks : undefined),
    [shownBlocks, doc?.id, showTranslation, blocks],
  );
  const changeLang = (lang: Lang) => {
    const next = new URLSearchParams(params);
    next.set('lang', lang);
    setParams(next, { replace: true });
  };

  useDocumentTitle(shownTitle);

  // Thời gian đọc tối thiểu: người bị đếm giờ chưa đọc xong -> nút "Bài kiểm tra" bị khóa.
  const { data: reading } = useReadingStatus(doc?.id);
  const quizLocked = !!reading?.tracked && !reading.progress?.completedAt;

  // Nhiệm vụ thực hành: đã đọc một tài liệu (bài hướng dẫn có slug "guide-...").
  const complete = useCompleteTask();
  const loadedSlug = doc?.slug;
  useEffect(() => {
    if (!loadedSlug) return;
    complete('readDoc');
    if (loadedSlug.startsWith('guide-')) complete('readGuide');
  }, [loadedSlug, complete]);

  // Mở link có #muc-3: nội dung tải bất đồng bộ nên trình duyệt chưa tự
  // cuộn được lúc đầu -> cuộn tay sau khi nội dung đã vẽ.
  // (Chạy lại khi nội dung hiển thị đổi: bản dịch tải xong sau bài gốc.)
  useEffect(() => {
    if (!doc || !location.hash) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [doc, shownBlocks, location.hash]);

  // Đợi luôn bản dịch (nhanh) để không nháy bản gốc rồi mới đổi sang bản dịch.
  if (isPending || (doc && viewLang && translation.isPending)) return <Spinner className="py-24" />;
  if (error || !doc) {
    const notFound = error instanceof ApiError && error.status === 404;
    // 401: bài của một bộ phận, khách (vd quét mã QR dán ở máy) phải đăng nhập mới đọc được.
    const needLogin = error instanceof ApiError && error.status === 401;
    const back = `${location.pathname}${location.search}${location.hash}`;
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={FileQuestionMark}
          title={needLogin ? t('doc.loginRequired') : notFound ? t('doc.notFound') : t('common.error')}
          description={needLogin ? t('doc.loginRequiredDesc') : notFound ? t('doc.notFoundDesc') : errorMessage(error)}
          action={
            needLogin ? (
              <Link to={`/login?next=${encodeURIComponent(back)}`}>
                <Button>{t('nav.login')}</Button>
              </Link>
            ) : (
              <Link to="/">
                <Button variant="secondary">{t('notFound.home')}</Button>
              </Link>
            )
          }
        />
      </div>
    );
  }


  const handleDelete = () => {
    if (!window.confirm(t('doc.deleteConfirm', { title: doc.title }))) return;
    deleteDoc.mutate(doc.id, {
      onSuccess: () => {
        toast.success(t('doc.deleted'));
        navigate('/', { replace: true });
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <div className="mx-auto max-w-page px-4 py-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)_240px] lg:gap-10 lg:px-8 lg:py-8">
      {/* Cột trái: tài liệu cùng thể loại */}
      <aside className="no-print hidden lg:block">
        <div className="sticky top-20 space-y-1">
          <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{t('doc.sameCategory')}</h2>
          {siblings?.map((s) => (
            <Link
              key={s.id}
              to={`/docs/${s.slug}`}
              className={cn(
                'block rounded-lg px-2 py-1.5 text-sm',
                s.id === doc.id ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {s.translated?.title ?? s.title}
            </Link>
          ))}
        </div>
      </aside>

      <article className="min-w-0">
        <nav className="no-print mb-3 flex items-center gap-1 text-sm text-muted">
          <Link to="/" className="hover:text-fg">
            {t('nav.home')}
          </Link>
          {categoryTrail.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link to={`/?category=${c.id}`} className="hover:text-fg">
                {c.name}
              </Link>
            </span>
          ))}
        </nav>

        <header className="mb-6 border-b border-border pb-5">
          <h1 className="text-3xl leading-tight font-bold">{shownTitle}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            {doc.category && (
              <Badge tone="accent">
                <CategoryIcon name={doc.category.iconName} className="h-3 w-3" /> {doc.category.name}
              </Badge>
            )}
            {doc.status === 'draft' && <Badge tone="warning">{t('status.draft')}</Badge>}
            <span>
              {t('doc.updatedBy', { date: formatDateTime(doc.updatedAt, i18n.language), name: doc.updatedBy?.displayName ?? '—' })}
            </span>
            {editor && <span>· {t('doc.version', { n: doc.version })}</span>}
          </div>

          <div className="no-print mt-4 flex flex-wrap gap-2">
            {editor && (
              <>
                <Link to={`/docs/${doc.slug}/edit`}>
                  <Button size="sm">
                    <Pencil className="h-4 w-4" /> {t('common.edit')}
                  </Button>
                </Link>
                <Link to={`/docs/${doc.slug}/history`} data-tour="doc-history">
                  <Button size="sm" variant="secondary">
                    <Clock className="h-4 w-4" /> {t('doc.history')}
                  </Button>
                </Link>
              </>
            )}
            <Button
              size="sm"
              variant="secondary"
              data-tour="share"
              onClick={() => {
                setShareOpen(true);
                complete('share');
              }}
            >
              <Share2 className="h-4 w-4" /> {t('common.share')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> {t('common.print')}
            </Button>
            {/* Bài kiểm tra / ôn tập CỦA BÀI NÀY (khóa tới khi đọc đủ thời gian). */}
            <QuizEntryButton docId={doc.id} loggedIn={!!user} locked={quizLocked} />
            {/* Tạo bài kiểm tra từ chính tài liệu này (Claude / AI nội bộ / tự soạn; chỉ bài đã xuất bản). */}
            {editor && doc.status === 'published' && (
              <Link to={`/quizzes/new?docs=${doc.id}`}>
                <Button size="sm" variant="secondary">
                  <ClipboardCheck className="h-4 w-4" /> {t('quiz.createFromDoc')}
                </Button>
              </Link>
            )}
            {editor && (
              <Button size="sm" variant="ghost" onClick={handleDelete} loading={deleteDoc.isPending} className="text-danger">
                <Trash className="h-4 w-4" /> {t('common.delete')}
              </Button>
            )}
          </div>
        </header>

        {doc.status === 'draft' && (
          <p className="no-print mb-6 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">{t('doc.draftBanner')}</p>
        )}

        {/* Chọn ngôn ngữ đọc + trạng thái bản dịch (ẩn nếu server chưa bật dịch). */}
        {tr?.available && <TranslationBar view={tr} docId={doc.id} slug={doc.slug} editor={editor} onChangeLang={changeLang} />}

        {/* Mục lục trên màn hình nhỏ */}
        {toc.length > 0 && (
          <details
            open={tocOpen}
            onToggle={(e) => setTocOpen(e.currentTarget.open)}
            className="no-print mb-6 rounded-xl border border-border p-3 lg:hidden"
          >
            <summary className="cursor-pointer text-sm font-medium">{t('doc.toc')}</summary>
            <div className="mt-3">
              <Toc entries={toc} onNavigate={() => setTocOpen(false)} />
            </div>
          </details>
        )}

        <DocContent blocks={shownBlocks} meta={meta} />
        {/* Mốc "cuối bài": đồng hồ đọc chỉ tính xong khi người đọc cuộn tới đây. */}
        <div id={READING_END_ID} aria-hidden className="h-px" />
      </article>

      {/* key theo phiên bản: bài vừa được sửa -> đồng hồ làm lại từ đầu. */}
      {reading?.tracked && <ReadingTracker key={`${doc.id}:${reading.version}`} docId={doc.id} status={reading} />}

      {/* Cột phải: mục lục */}
      <aside className="no-print hidden lg:block">
        {toc.length > 0 && (
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t('doc.toc')}</h2>
            <Toc entries={toc} />
          </div>
        )}
      </aside>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} slug={doc.slug} title={doc.title} />
    </div>
  );
}
