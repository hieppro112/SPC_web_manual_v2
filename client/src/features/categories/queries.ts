// features/categories/queries.ts
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildCategoryTree } from './tree.ts';
import { categoriesApi, type CategoryInput } from './api.ts';

export const categoriesKey = ['categories'] as const;

export function useCategories() {
  return useQuery({ queryKey: categoriesKey, queryFn: categoriesApi.list });
}

// Cây thể loại dựng sẵn từ danh sách. useMemo: chỉ dựng lại khi dữ liệu đổi.
export function useCategoryTree() {
  const query = useCategories();
  const tree = useMemo(() => buildCategoryTree(query.data ?? []), [query.data]);
  return { ...query, tree };
}

// Ghi xong thì "invalidate": đánh dấu cache cũ là hết hạn -> mọi màn hình
// đang dùng danh sách thể loại tự tải lại. Không phải tự cập nhật tay.
export function useSaveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: CategoryInput & { id?: string }) => (id ? categoriesApi.update(id, data) : categoriesApi.create(data)),
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
