// ============================================================
// DocPage — trang đọc một tài liệu  (/docs/:slug)
// ============================================================
//  ┌────────────┬───────────────────────────┬──────────────┐
//  │ Thể loại   │ breadcrumb, tiêu đề, meta │ Mục lục      │
//  │ (như trang │ nút + dải "Bài kiểm tra"  │              │
//  │  chủ, tô   │ nội dung các khối         │ Trong thể    │
//  │  sáng thể  │ thẻ "Đọc xong rồi?"       │ loại này     │
//  │  loại bài) │ Bài trước / sau, cùng loại│              │
//  └────────────┴───────────────────────────┴──────────────┘
// Màn hình nhỏ: hai cột bên ẩn, mục lục thu vào một mục bấm mở; chuyển bài bằng
// phần "Bài trước / sau" + lưới cùng thể loại ở cuối bài.

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronRight, Clock, Eye, FileQuestionMark, History, Pencil, Printer, Share2, Trash } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { computeBlockMeta } from '../../blocks/meta.ts';
import { withDefaults } from '../../blocks/registry.ts';
import { ApiError } from '../../lib/http.ts';
import { errorMessage, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { isEditor } from '../../lib/types.ts';
import { useCurrentUser } from '../auth/queries.ts';
import CategoryIcon from '../categories/CategoryIcon.tsx';
import CategoryNav from '../categories/CategoryNav.tsx';
import { useCategories } from '../categories/queries.ts';
import { categoryPath } from '../categories/tree.ts';
import LikeButton from '../engagement/LikeButton.tsx';
import { useRecordView } from '../engagement/queries.ts';
import { useCompleteTask } from '../guide/queries.ts';
import { READING_END_ID } from '../reading/api.ts';
import { useReadingStatus } from '../reading/queries.ts';
import ReadingTracker from '../reading/ReadingTracker.tsx';
import { LANGS, type Lang } from '../translations/api.ts';
import { useDocTranslation } from '../translations/queries.ts';
import TranslationBar from '../translations/TranslationBar.tsx';
import DeckDownloadButton from './DeckDownloadButton.tsx';
import DocContent from './DocContent.tsx';
import { DocNeighborsEnd, SameCategoryList } from './DocNeighbors.tsx';
import DocQuizPanel from './DocQuizPanel.tsx';
import ReadingProgress from './ReadingProgress.tsx';
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

  // Tài liệu cùng thể loại: cột phải ("Trong thể loại này") + cuối bài (bài trước / sau).
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

  // Mở bài -> +1 lượt xem (mỗi người tối đa 1 lần / ngày, server tự lọc trùng).
  useRecordView(doc?.id);

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

  // Số phút đọc ước tính: server tính sẵn trong danh sách bài -> lấy từ danh sách cùng thể loại.
  const readMinutes = siblings?.find((s) => s.id === doc.id)?.readMinutes;
  const lead = !showTranslation && doc.desc?.trim() ? doc.desc : '';

  return (
    <div className="mx-auto max-w-page px-4 py-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)_240px] lg:gap-10 lg:px-8 lg:py-8">
      {/* Vạch tiến độ đọc ngay dưới thanh trên cùng */}
      <ReadingProgress targetId="doc-article" />

      {/* Cột trái: thanh thể loại như trang chủ, tô sáng thể loại của bài đang đọc.
          Thanh cuộn riêng + không cuộn lan sang trang. */}
      <aside className="no-print hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain pr-1">
          <CategoryNav activeId={doc.category?.id ?? null} />
        </div>
      </aside>

      <article id="doc-article" className="min-w-0">
        {/* Cột đọc rộng tối đa ~50rem (≈ 75–80 chữ / dòng): dòng quá dài thì mắt
            khó tìm lại đầu dòng kế tiếp -> đọc nhanh mỏi. */}
        <div className="mx-auto max-w-[50rem]">
          <nav className="no-print mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
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

          <header className="mb-8 border-b border-border pb-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {doc.category && (
                <Badge tone="accent">
                  <CategoryIcon name={doc.category.iconName} className="h-3 w-3" /> {doc.category.name}
                </Badge>
              )}
              {doc.status === 'draft' && <Badge tone="warning">{t('status.draft')}</Badge>}
            </div>
            <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance md:text-4xl">{shownTitle}</h1>
            {lead && <p className="mt-3 text-lg leading-relaxed text-muted">{lead}</p>}

            {/* Một dòng thông tin gọn, ngăn bằng dấu chấm giữa */}
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span>{t('doc.updatedBy', { date: formatDateTime(doc.updatedAt, i18n.language), name: doc.updatedBy?.displayName ?? '—' })}</span>
              {!!readMinutes && (
                <span className="flex items-center gap-1">
                  · <Clock className="h-4 w-4" /> {t('doc.readMinutes', { count: readMinutes })}
                </span>
              )}
              {doc.stats && (
                <span className="flex items-center gap-1" title={t('engagement.viewsHint')}>
                  · <Eye className="h-4 w-4" /> {doc.stats.views}
                </span>
              )}
              {editor && <span>· {t('doc.version', { n: doc.version })}</span>}
            </div>

            {/* Nút thao tác: nhóm "đọc" bên trái, nhóm "soạn" (biên tập) bên phải */}
            <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {doc.stats && <LikeButton docId={doc.id} slug={doc.slug} liked={doc.stats.likedByMe} likes={doc.stats.likes} loggedIn={!!user} />}
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
                <Button size="sm" variant="secondary" onClick={() => window.print()} title={t('common.print')}>
                  <Printer className="h-4 w-4" /> <span className="hidden sm:inline">{t('common.print')}</span>
                </Button>
                {/* Tải bài dạng slide PowerPoint (bản gốc + bản đã dịch). */}
                <DeckDownloadButton docId={doc.id} />
              </div>
              {editor && (
                <div className="flex flex-wrap gap-2">
                  <Link to={`/docs/${doc.slug}/edit`}>
                    <Button size="sm" variant="secondary">
                      <Pencil className="h-4 w-4" /> {t('common.edit')}
                    </Button>
                  </Link>
                  <Link to={`/docs/${doc.slug}/history`} data-tour="doc-history">
                    <Button size="sm" variant="ghost">
                      <History className="h-4 w-4" /> {t('doc.history')}
                    </Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={handleDelete} loading={deleteDoc.isPending} className="text-danger" title={t('common.delete')}>
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Bài kiểm tra: dải màu riêng, nổi hơn các nút thường */}
            <DocQuizPanel
              placement="top"
              docId={doc.id}
              published={doc.status === 'published'}
              loggedIn={!!user}
              editor={editor}
              locked={quizLocked}
            />
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

          {/* doc-reading: chữ to hơn, giãn dòng thoáng hơn (xem index.css) */}
          <div className="doc-reading">
            <DocContent blocks={shownBlocks} meta={meta} />
          </div>
          {/* Mốc "cuối bài": đồng hồ đọc chỉ tính xong khi người đọc cuộn tới đây. */}
          <div id={READING_END_ID} aria-hidden className="h-px" />

          {/* Đọc xong -> mời làm bài kiểm tra, rồi gợi ý bài tiếp theo */}
          <DocQuizPanel
            placement="end"
            docId={doc.id}
            published={doc.status === 'published'}
            loggedIn={!!user}
            editor={editor}
            locked={quizLocked}
          />
          {doc.category && siblings && (
            <DocNeighborsEnd siblings={siblings} currentId={doc.id} categoryId={doc.category.id} categoryName={doc.category.name} />
          )}
        </div>
      </article>

      {/* key theo phiên bản: bài vừa được sửa -> đồng hồ làm lại từ đầu. */}
      {reading?.tracked && <ReadingTracker key={`${doc.id}:${reading.version}`} docId={doc.id} status={reading} />}

      {/* Cột phải: mục lục + bài trong cùng thể loại (bấm là sang bài, khỏi quay về trang chủ) */}
      <aside className="no-print hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-8 overflow-y-auto overscroll-contain pr-1">
          {toc.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t('doc.toc')}</h2>
              <Toc entries={toc} />
            </div>
          )}
          {doc.category && siblings && <SameCategoryList siblings={siblings} currentId={doc.id} categoryId={doc.category.id} />}
        </div>
      </aside>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} slug={doc.slug} title={doc.title} />
    </div>
  );
}
