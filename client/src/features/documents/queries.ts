// ============================================================
// features/documents/queries.ts — hook đọc/ghi tài liệu
// ============================================================
// Query key có cấu trúc để invalidate theo nhóm:
//   ['documents', 'list', {q, category}]   danh sách
//   ['documents', 'slug', slug]            một tài liệu
//   ['documents', 'versions', id, ...]     lịch sử
// invalidate ['documents'] = làm mới TẤT CẢ những thứ trên.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesKey } from '../categories/queries.ts';
import type { DocInput } from '../../lib/types.ts';
import { documentsApi, type DocListParams } from './api.ts';

export function useDocuments(params: DocListParams, enabled = true) {
  return useQuery({
    queryKey: ['documents', 'list', params],
    queryFn: () => documentsApi.list(params),
    enabled,
    // Gõ tìm kiếm thì giữ kết quả cũ trên màn hình trong lúc chờ kết quả
    // mới, tránh danh sách nháy trắng sau mỗi phím.
    placeholderData: (previous) => previous,
  });
}

export function useDocument(slug: string | undefined) {
  return useQuery({
    queryKey: ['documents', 'slug', slug],
    queryFn: () => documentsApi.getBySlug(slug!),
    enabled: !!slug,
    // 404 thì không thử lại 3 lần như mặc định — tài liệu không có là không có.
    retry: false,
  });
}

// Ghi tài liệu làm thay đổi cả số đếm trong thể loại -> làm mới cả hai.
function useInvalidateDocs() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['documents'] }),
      queryClient.invalidateQueries({ queryKey: categoriesKey }),
    ]);
}

export function useSaveDocument() {
  const invalidate = useInvalidateDocs();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: DocInput }) =>
      id ? documentsApi.update(id, data) : documentsApi.create(data),
    onSuccess: invalidate,
  });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateDocs();
  return useMutation({ mutationFn: documentsApi.remove, onSuccess: invalidate });
}

export function useVersions(docId: string | undefined) {
  return useQuery({
    queryKey: ['documents', 'versions', docId],
    queryFn: () => documentsApi.versions(docId!),
    enabled: !!docId,
  });
}

export function useVersion(docId: string | undefined, version: number | null) {
  return useQuery({
    queryKey: ['documents', 'versions', docId, version],
    queryFn: () => documentsApi.version(docId!, version!),
    enabled: !!docId && version !== null,
  });
}

export function useRestoreVersion() {
  const invalidate = useInvalidateDocs();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => documentsApi.restore(id, version),
    onSuccess: invalidate,
  });
}
