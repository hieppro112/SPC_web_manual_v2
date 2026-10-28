// features/categories/queries.ts
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildCategoryTree } from './tree.ts';
import { categoriesApi, requestsApi, templatesApi, type CategoryInput, type RequestStatus, type TemplateInput } from './api.ts';

export const categoriesKey = ['categories'] as const;
const templatesKey = ['category-templates'] as const;
const requestsKey = ['category-requests'] as const;

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
    mutationFn: ({ id, ...data }: CategoryInput & { id?: string }) =>
      id ? categoriesApi.update(id, data).then((c) => ({ ...c, defaultsCreated: 0 })) : categoriesApi.create(data),
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

// ---------- Mục mặc định (admin) ----------

export function useTemplates() {
  return useQuery({ queryKey: templatesKey, queryFn: templatesApi.list });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: TemplateInput & { id?: string }) => (id ? templatesApi.update(id, data) : templatesApi.create(data)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: templatesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  });
}

// Chép mục mặc định vào các bộ phận: id = chỉ một mục (vừa thêm), bỏ trống = đồng bộ tất cả.
export function useApplyDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId?: string) => (templateId ? templatesApi.apply(templateId) : categoriesApi.syncDefaults()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey }),
  });
}

// ---------- Đề xuất thể loại ----------

export function useMyRequests() {
  return useQuery({ queryKey: [...requestsKey, 'mine'], queryFn: requestsApi.mine });
}

export function useRequests(status: RequestStatus) {
  return useQuery({ queryKey: [...requestsKey, status], queryFn: () => requestsApi.list(status) });
}

// Số đề xuất chờ duyệt — số đỏ trên avatar admin (cùng chỗ với tài khoản chờ duyệt).
export function usePendingRequestCount(enabled: boolean) {
  return (
    useQuery({
      queryKey: [...requestsKey, 'count'],
      queryFn: requestsApi.pendingCount,
      enabled,
      select: (r) => r.count,
      refetchInterval: 60_000,
    }).data ?? 0
  );
}

// Mọi thao tác với đề xuất: làm mới cả danh sách đề xuất lẫn cây thể loại (duyệt = có thể loại mới).
function useRequestMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: requestsKey });
      void queryClient.invalidateQueries({ queryKey: categoriesKey });
    },
  });
}
export const useCreateRequest = () => useRequestMutation(requestsApi.create);
export const useCancelRequest = () => useRequestMutation(requestsApi.cancel);
export const useApproveRequest = () =>
  useRequestMutation(({ id, ...data }: { id: string; name: string; iconName: string }) => requestsApi.approve(id, data));
export const useRejectRequest = () => useRequestMutation(({ id, reason }: { id: string; reason: string }) => requestsApi.reject(id, reason));
