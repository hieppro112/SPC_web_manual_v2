// ============================================================
// AppLayout — khung chung: header dính trên cùng + nội dung trang
// ============================================================
// Là route CHA trong router.tsx; trang con vẽ vào chỗ <Outlet />.
// 🔸 Flutter: giống một Scaffold dùng chung có appBar, body = trang con.

import { Link, Outlet, ScrollRestoration, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { BookOpen, FilePlus2, LogIn, UserPlus } from 'lucide-react';
import Button from '../components/ui/Button.tsx';
import SearchBox from '../components/SearchBox.tsx';
import { useCurrentUser } from '../features/auth/queries.ts';
import { useTheme } from '../theme/useTheme.ts';
import ThemeLanguageMenu from './ThemeLanguageMenu.tsx';
import UserMenu from './UserMenu.tsx';

export default function AppLayout() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { resolved } = useTheme();
  const [params] = useSearchParams();
  const category = params.get('category');

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 h-14 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">{t('app.name')}</span>
          </Link>

          <SearchBox className="mx-auto hidden w-full max-w-md md:block" />

          <div className="ml-auto flex items-center gap-1.5 md:ml-0">
            {user && (
              // Đang xem một thể loại -> tài liệu mới chọn sẵn thể loại đó.
              <Link to={category ? `/new?category=${category}` : '/new'}>
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

      {/* Nhớ vị trí cuộn khi bấm Back (về lại đúng chỗ đang đọc trong danh sách). */}
      <ScrollRestoration />
      <Toaster theme={resolved} position="bottom-right" richColors closeButton />
    </div>
  );
}
