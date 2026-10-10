// features/categories/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from './api.ts';

export const categoriesKey = ['categories'] as const;

export function useCategories() {
  return useQuery({ queryKey: categoriesKey, queryFn: categoriesApi.list });
}

// Ghi xong thì "invalidate": đánh dấu cache cũ là hết hạn -> mọi màn hình
// đang dùng danh sách thể loại tự tải lại. Không phải tự cập nhật tay.
export function useSaveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, iconName }: { id?: string; name: string; iconName: string }) =>
      id ? categoriesApi.update(id, { name, iconName }) : categoriesApi.create({ name, iconName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey }),
  });
}
