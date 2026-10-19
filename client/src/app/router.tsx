// ============================================================
// app/router.tsx — Bản đồ các trang (React Router)
// ============================================================
//   /                         trang chủ (danh sách, lọc, tìm)      ai cũng xem
//   /docs/:slug               đọc tài liệu                          ai cũng xem
//   /login                    đăng nhập / setup lần đầu
//   /register                 tự đăng ký (chờ admin duyệt)
//   /m/upload/:token          trang upload trên điện thoại (không có header)
//   /guide                    hướng dẫn & thực hành (tour, nhiệm vụ) ai cũng xem
//   /quizzes                  bài kiểm tra của tôi (+ quản lý đề)  đã đăng nhập
//   /quizzes/:id              làm bài                               đã đăng nhập
//   /new                      tạo tài liệu                          editor
//   /docs/:slug/edit          sửa tài liệu                          editor
//   /docs/:slug/history       lịch sử phiên bản                     editor
//   /docs/:slug/translate/:lang  sửa tay bản dịch (vi/en/ja)         editor
//   /import                   nhập bài từ PowerPoint (qua Claude)   editor
//   /quizzes/new              tạo đề bằng AI                        editor
//   /quizzes/:id/edit         sửa đề                                editor
//   /quizzes/:id/results      bảng điểm + xuất Excel                admin
//   /admin/categories         quản lý thể loại                      admin
//   /admin/users              quản lý tài khoản                     admin
//
// `lazy`: trang chỉ editor/admin dùng (trình soạn, kéo thả...) được tách
// thành file JS riêng, chỉ tải khi mở trang đó. Người chỉ đọc tài liệu
// không phải tải phần code này -> trang đọc mở nhanh hơn.
// 🔸 Flutter: giống deferred import (`import ... deferred as`).

import { createBrowserRouter } from 'react-router';
import DocPage from '../features/documents/DocPage.tsx';
import HomePage from '../features/documents/HomePage.tsx';
import LoginPage from '../features/auth/LoginPage.tsx';
import RegisterPage from '../features/auth/RegisterPage.tsx';
import RequireAuth from '../features/auth/RequireAuth.tsx';
import MobileUploadPage from '../features/media/MobileUploadPage.tsx';
import AppLayout from './AppLayout.tsx';
import NotFoundPage from './NotFoundPage.tsx';
import RouteError from './RouteError.tsx';

export const router = createBrowserRouter([
  { path: '/m/upload/:token', element: <MobileUploadPage />, errorElement: <RouteError /> },
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'docs/:slug', element: <DocPage /> },
      { path: 'guide', lazy: () => import('../features/guide/GuidePage.tsx').then((m) => ({ Component: m.default })) },
      {
        // Ai đăng nhập cũng vào được (kể cả role "user"): làm bài kiểm tra.
        element: <RequireAuth />,
        children: [
          { path: 'quizzes', lazy: () => import('../features/quizzes/QuizListPage.tsx').then((m) => ({ Component: m.default })) },
          { path: 'quizzes/:id', lazy: () => import('../features/quizzes/QuizTakePage.tsx').then((m) => ({ Component: m.default })) },
        ],
      },
      {
        element: <RequireAuth allow="editor" />,
        children: [
          { path: 'new', lazy: () => import('../features/editor/EditorPage.tsx').then((m) => ({ Component: m.default })) },
          { path: 'docs/:slug/edit', lazy: () => import('../features/editor/EditorPage.tsx').then((m) => ({ Component: m.default })) },
          {
            path: 'docs/:slug/history',
            lazy: () => import('../features/documents/HistoryPage.tsx').then((m) => ({ Component: m.default })),
          },
          {
            path: 'docs/:slug/translate/:lang',
            lazy: () => import('../features/translations/TranslationEditPage.tsx').then((m) => ({ Component: m.default })),
          },
          { path: 'import', lazy: () => import('../features/imports/ImportPage.tsx').then((m) => ({ Component: m.default })) },
          { path: 'quizzes/new', lazy: () => import('../features/quizzes/QuizCreatePage.tsx').then((m) => ({ Component: m.default })) },
          { path: 'quizzes/:id/edit', lazy: () => import('../features/quizzes/QuizEditPage.tsx').then((m) => ({ Component: m.default })) },
        ],
      },
      {
        element: <RequireAuth allow="admin" />,
        children: [
          {
            path: 'admin/categories',
            lazy: () => import('../features/categories/CategoriesAdminPage.tsx').then((m) => ({ Component: m.default })),
          },
          {
            path: 'admin/users',
            lazy: () => import('../features/users/UsersAdminPage.tsx').then((m) => ({ Component: m.default })),
          },
          {
            path: 'quizzes/:id/results',
            lazy: () => import('../features/quizzes/QuizResultsPage.tsx').then((m) => ({ Component: m.default })),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
