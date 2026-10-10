// ============================================================
// RequireAuth — "cổng" cho các route cần đăng nhập
// ============================================================
// Đặt làm route CHA trong router.tsx; các route con chỉ hiện khi qua cổng:
//   khách          -> chuyển tới /login?next=<trang đang định vào>
//   thiếu quyền    -> chuyển về trang chủ
// <Outlet /> là chỗ route con được vẽ vào.
// 🔸 Flutter: giống `redirect` của go_router kiểm tra trạng thái đăng nhập.
//
// Lưu ý: đây chỉ là trải nghiệm người dùng. Bảo vệ THẬT nằm ở server
// (requireAuth/requireAdmin) — người dùng có thể sửa code JS trên máy họ.

import { Navigate, Outlet, useLocation } from 'react-router';
import Spinner from '../../components/ui/Spinner.tsx';
import type { Role } from '../../lib/types.ts';
import { useMe } from './queries.ts';

export default function RequireAuth({ role }: { role?: Role }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();

  if (isPending) return <Spinner className="py-24" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
