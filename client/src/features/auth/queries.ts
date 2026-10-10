// ============================================================
// features/auth/queries.ts — hook đăng nhập (TanStack Query)
// ============================================================
// TanStack Query lo hộ: gọi API, lưu kết quả vào bộ nhớ đệm (cache) theo
// "query key", trạng thái loading/error, tự gọi lại khi cần.
//   useQuery    — ĐỌC dữ liệu   (GET)
//   useMutation — GHI dữ liệu   (POST/PUT/DELETE)
// 🔸 Flutter: giống FutureBuilder + một lớp cache dùng chung (kiểu Riverpod FutureProvider).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from './api.ts';

export const meKey = ['auth', 'me'] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: authApi.me, staleTime: 5 * 60 * 1000 });
}

// Tiện dụng: chỉ cần biết user hiện tại (null = khách).
export function useCurrentUser() {
  return useMe().data ?? null;
}

export function useSetupStatus() {
  return useQuery({ queryKey: ['auth', 'setup-status'], queryFn: authApi.setupStatus });
}

// Đăng nhập/đăng xuất làm THAY ĐỔI những gì người dùng được thấy (bài
// nháp, số tài liệu...), nên xóa toàn bộ cache để mọi màn hình tải lại.
function useResetAfterAuthChange() {
  const queryClient = useQueryClient();
  return async (user: unknown) => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    queryClient.setQueryData(meKey, user);
    await queryClient.invalidateQueries({ queryKey: ['auth', 'setup-status'] });
  };
}

export function useLogin() {
  const reset = useResetAfterAuthChange();
  return useMutation({ mutationFn: authApi.login, onSuccess: reset });
}

export function useSetup() {
  const reset = useResetAfterAuthChange();
  return useMutation({ mutationFn: authApi.setup, onSuccess: reset });
}

export function useLogout() {
  const reset = useResetAfterAuthChange();
  return useMutation({ mutationFn: authApi.logout, onSuccess: () => reset(null) });
}

export function useChangePassword() {
  return useMutation({ mutationFn: authApi.changePassword });
}
