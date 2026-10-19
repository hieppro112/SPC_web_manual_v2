// ============================================================
// AppLayout — khung chung: header dính trên cùng + nội dung trang
// ============================================================
// Là route CHA trong router.tsx; trang con vẽ vào chỗ <Outlet />.
// 🔸 Flutter: giống một Scaffold dùng chung có appBar, body = trang con.

import { Link, Outlet, ScrollRestoration, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { BookOpen, CircleHelp, ClipboardCheck, FilePlus2, FileUp, LogIn, UserPlus } from 'lucide-react';
import Button from '../components/ui/Button.tsx';
import SearchBox from '../components/SearchBox.tsx';
import AiChatWidget from '../features/ai/AiChatWidget.tsx';
import { useCurrentUser } from '../features/auth/queries.ts';
import TourProvider from '../features/guide/tour/TourProvider.tsx';
import { useUnseenImportCount } from '../features/imports/queries.ts';
import { useUnseenJobCount } from '../features/quizzes/queries.ts';
import { isEditor } from '../lib/types.ts';
import { useTheme } from '../theme/useTheme.ts';
import ThemeLanguageMenu from './ThemeLanguageMenu.tsx';
import UserMenu from './UserMenu.tsx';

// TourProvider bọc cả trang: tour / gợi ý "Chỉ cho tôi" gọi được từ mọi nơi.
export default function AppLayout() {
  return (
    <TourProvider>
      <LayoutShell />
    </TourProvider>
  );
}

function LayoutShell() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { resolved } = useTheme();
  const [params] = useSearchParams();
  const category = params.get('category');
  const unseenJobs = useUnseenJobCount(isEditor(user)).data?.count ?? 0;
  const unseenImports = useUnseenImportCount(isEditor(user)).data?.count ?? 0;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 h-14 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-page items-center gap-3 px-4 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">{t('app.name')}</span>
          </Link>

          <SearchBox className="mx-auto hidden w-full max-w-md md:block" />

          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            <Link to="/guide" title={t('nav.guide')} data-tour="help">
              <Button size="sm" variant="ghost">
                <CircleHelp className="h-4 w-4" />
                <span className="hidden xl:inline">{t('nav.guide')}</span>
              </Button>
            </Link>
            {user && (
              <Link to="/quizzes" title={t('nav.quizzes')} className="relative" data-tour="quizzes">
                <Button size="sm" variant="ghost">
                  <ClipboardCheck className="h-4 w-4" />
                  <span className="hidden lg:inline">{t('nav.quizzes')}</span>
                </Button>
                {/* Chấm đỏ: số đề Claude đã tạo xong mà người này chưa mở */}
                {unseenJobs > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {unseenJobs}
                  </span>
                )}
              </Link>
            )}
            {isEditor(user) && (
              <Link to="/import" title={t('nav.import')} className="relative" data-tour="import">
                <Button size="sm" variant="ghost">
                  <FileUp className="h-4 w-4" />
                  <span className="hidden xl:inline">{t('nav.import')}</span>
                </Button>
                {/* Chấm đỏ: số bài nhập từ PowerPoint đã xong mà chưa mở */}
                {unseenImports > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {unseenImports}
                  </span>
                )}
              </Link>
            )}
            {isEditor(user) && (
              // Đang xem một thể loại -> tài liệu mới chọn sẵn thể loại đó.
              <Link to={category ? `/new?category=${category}` : '/new'} data-tour="new-doc">
                <Button size="sm">
                  <FilePlus2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav.newDoc')}</span>
                </Button>
              </Link>
            )}
            <ThemeLanguageMenu />
            {user ? (
              <UserMenu user={user} />
            ) : (
              <>
                <Link to="/login">
                  <Button size="sm" variant="ghost">
                    <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">{t('nav.login')}</span>
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm" variant="secondary">
                    <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">{t('nav.register')}</span>
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <Outlet />

      {/* Trợ lý AI: nút 💬 nổi ở mọi trang (tự ẩn nếu server chưa bật AI). */}
      <AiChatWidget />
      {/* Nhớ vị trí cuộn khi bấm Back (về lại đúng chỗ đang đọc trong danh sách). */}
      <ScrollRestoration />
      {/* offset bottom: chừa chỗ cho nút trợ lý AI ở góc phải dưới */}
      <Toaster theme={resolved} position="bottom-right" offset={{ bottom: 80 }} richColors closeButton />
    </div>
  );
}
