// ============================================================
// RequireAuth — "cổng" cho các route cần đăng nhập
// ============================================================
// Đặt làm route CHA trong router.tsx; các route con chỉ hiện khi qua cổng:
//   khách          -> chuyển tới /login?next=<trang đang định vào>
//   thiếu quyền    -> chuyển về trang chủ
// <Outlet /> là chỗ route con được vẽ vào.
// 🔸 Flutter: giống `redirect` của go_router kiểm tra trạng thái đăng nhập.
//
//   <RequireAuth />                ai đăng nhập cũng qua (kể cả role "user")
//   <RequireAuth allow="editor" /> chỉ editor + admin
//   <RequireAuth allow="admin" />  chỉ admin
//
// Lưu ý: đây chỉ là trải nghiệm người dùng. Bảo vệ THẬT nằm ở server
// (requireAuth/requireEditor/requireAdmin) — người dùng có thể sửa code JS trên máy họ.

import { Navigate, Outlet, useLocation } from 'react-router';
import Spinner from '../../components/ui/Spinner.tsx';
import { isEditor } from '../../lib/types.ts';
import { useMe } from './queries.ts';

export default function RequireAuth({ allow }: { allow?: 'editor' | 'admin' }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();

  if (isPending) return <Spinner className="py-24" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (allow === 'admin' && user.role !== 'admin') return <Navigate to="/" replace />;
  if (allow === 'editor' && !isEditor(user)) return <Navigate to="/" replace />;
  return <Outlet />;
}
