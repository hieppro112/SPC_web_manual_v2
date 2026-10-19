// Menu tài khoản: tên, quyền, link quản trị, đổi mật khẩu, đăng xuất.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FolderCog, KeyRound, LogOut, Users } from 'lucide-react';
import MenuItem from '../components/ui/MenuItem.tsx';
import Popover from '../components/ui/Popover.tsx';
import ChangePasswordDialog from '../features/auth/ChangePasswordDialog.tsx';
import { useLogout } from '../features/auth/queries.ts';
import { usePendingCount } from '../features/users/queries.ts';
import type { User } from '../lib/types.ts';

export default function UserMenu({ user }: { user: User }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const [passwordOpen, setPasswordOpen] = useState(false);
  // Admin thấy số người đang chờ duyệt ngay trên avatar.
  const pendingCount = usePendingCount(user.role === 'admin');

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
            {user.role === 'admin' && (
              <>
                <MenuItem
                  icon={FolderCog}
                  onClick={() => {
                    close();
                    navigate('/admin/categories');
                  }}
                >
                  {t('nav.categories')}
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
                    {pendingCount > 0 && (
                      <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{pendingCount}</span>
                    )}
                  </span>
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
