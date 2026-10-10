// features/users/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '../../lib/types.ts';
import { usersApi, type UserUpdate } from './api.ts';

const usersKey = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: usersKey, queryFn: usersApi.list });
}

// Số tài khoản chờ duyệt — cho chấm đỏ trên menu admin.
// Dùng CHUNG cache với useUsers (cùng query key), `select` chỉ lấy ra con
// số cần thiết. `enabled`: chỉ admin mới gọi (API chỉ cho admin).
export function usePendingCount(enabled: boolean) {
  return useQuery({
    queryKey: usersKey,
    queryFn: usersApi.list,
    enabled,
    select: (users) => users.filter((u) => u.status === 'pending').length,
    // Thỉnh thoảng hỏi lại để admin thấy đăng ký mới mà không cần F5.
    refetchInterval: 60_000,
  }).data ?? 0;
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: usersKey });
}

export function useCreateUser() {
  const onSuccess = useInvalidateUsers();
  return useMutation({ mutationFn: usersApi.create, onSuccess });
}

export function useUpdateUser() {
  const onSuccess = useInvalidateUsers();
  return useMutation({ mutationFn: ({ id, data }: { id: string; data: UserUpdate }) => usersApi.update(id, data), onSuccess });
}

export function useApproveUser() {
  const onSuccess = useInvalidateUsers();
  return useMutation({ mutationFn: ({ id, role }: { id: string; role: Role }) => usersApi.approve(id, role), onSuccess });
}

export function useDeleteUser() {
  const onSuccess = useInvalidateUsers();
  return useMutation({ mutationFn: usersApi.remove, onSuccess });
}
