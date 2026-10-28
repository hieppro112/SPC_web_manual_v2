// Menu tài khoản: tên, quyền, link quản trị, đổi mật khẩu, đăng xuất.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BarChart3, BookOpenCheck, FolderCog, FolderPlus, Heart, KeyRound, LogOut, Users } from 'lucide-react';
import MenuItem from '../components/ui/MenuItem.tsx';
import Popover from '../components/ui/Popover.tsx';
import ChangePasswordDialog from '../features/auth/ChangePasswordDialog.tsx';
import { useLogout } from '../features/auth/queries.ts';
import { usePendingRequestCount } from '../features/categories/queries.ts';
import { usePendingCount } from '../features/users/queries.ts';
import type { User } from '../lib/types.ts';

const PendingBadge = ({ count }: { count: number }) => (
  <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{count}</span>
);

export default function UserMenu({ user }: { user: User }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const [passwordOpen, setPasswordOpen] = useState(false);
  // Admin thấy ngay trên avatar tổng số việc chờ duyệt: tài khoản + đề xuất thể loại.
  const pendingUsers = usePendingCount(user.role === 'admin');
  const pendingCategories = usePendingRequestCount(user.role === 'admin');
  const pendingCount = pendingUsers + pendingCategories;

  return (
    <>
      <Popover
        align="right"
        trigger={(toggle) => (
          <button
            type="button"
            onClick={toggle}
            data-tour="account"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
            title={user.displayName}
          >
            {/* Chữ cái đầu của tên làm "avatar". */}
            {user.displayName.trim().charAt(0).toUpperCase()}
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        )}
      >
        {(close) => (
          <div className="w-56">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-muted">
                @{user.username} · {t(`users.${user.role}`)}
              </p>
            </div>
            <div className="my-1 border-t border-border" />
            <MenuItem
              icon={Heart}
              onClick={() => {
                close();
                navigate('/favorites');
              }}
            >
              {t('nav.favorites')}
            </MenuItem>
            {/* Biên tập: đề xuất thể loại mới (admin thì tự tạo trong Quản lý thể loại). */}
            {user.role === 'editor' && (
              <MenuItem
                icon={FolderPlus}
                onClick={() => {
                  close();
                  navigate('/category-requests');
                }}
              >
                {t('nav.categoryRequests')}
              </MenuItem>
            )}
            {user.role === 'admin' && (
              <>
                <MenuItem
                  icon={FolderCog}
                  onClick={() => {
                    close();
                    // Có đề xuất đang chờ -> mở thẳng tab "Chờ duyệt".
                    navigate(pendingCategories > 0 ? '/admin/categories?tab=requests' : '/admin/categories');
                  }}
                >
                  <span className="flex items-center justify-between gap-2">
                    {t('nav.categories')}
                    {pendingCategories > 0 && <PendingBadge count={pendingCategories} />}
                  </span>
                </MenuItem>
                <MenuItem
                  icon={Users}
                  onClick={() => {
                    close();
                    navigate('/admin/users');
                  }}
                >
                  <span className="flex items-center justify-between gap-2">
                    {t('nav.users')}
                    {pendingUsers > 0 && <PendingBadge count={pendingUsers} />}
                  </span>
                </MenuItem>
                <MenuItem
                  icon={BookOpenCheck}
                  onClick={() => {
                    close();
                    navigate('/admin/reading');
                  }}
                >
                  {t('nav.readingReport')}
                </MenuItem>
                <MenuItem
                  icon={BarChart3}
                  onClick={() => {
                    close();
                    navigate('/admin/stats');
                  }}
                >
                  {t('nav.stats')}
                </MenuItem>
              </>
            )}
            <MenuItem
              icon={KeyRound}
              onClick={() => {
                close();
                setPasswordOpen(true);
              }}
            >
              {t('nav.changePassword')}
            </MenuItem>
            <MenuItem
              icon={LogOut}
              onClick={() => {
                close();
                logout.mutate(undefined, { onSuccess: () => navigate('/') });
              }}
            >
              {t('nav.logout')}
            </MenuItem>
          </div>
        )}
      </Popover>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}
