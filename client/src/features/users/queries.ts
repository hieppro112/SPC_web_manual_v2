// features/users/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, type UserUpdate } from './api.ts';

const usersKey = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: usersKey, queryFn: usersApi.list });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: usersApi.create, onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }) });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserUpdate }) => usersApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: usersApi.remove, onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }) });
}
