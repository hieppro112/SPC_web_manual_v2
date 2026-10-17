// features/imports/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuizLang } from '../quizzes/api.ts';
import { importsApi } from './api.ts';

// Hỏi lại mỗi 30 giây khi còn yêu cầu chưa xong -> trạng thái tự cập nhật.
export function useImportJobs() {
  return useQuery({
    queryKey: ['import-jobs'],
    queryFn: importsApi.list,
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === 'pending' || j.status === 'processing') ? 30_000 : false),
  });
}

// Chấm đỏ trên nút "Nhập PowerPoint": bài nháp đã tạo xong mà chưa mở.
export function useUnseenImportCount(enabled: boolean) {
  return useQuery({ queryKey: ['import-jobs', 'unseen'], queryFn: importsApi.unseenCount, enabled, refetchInterval: 60_000, retry: false });
}

export function useUploadImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { file: File; categoryId: string; language: QuizLang; onProgress: (p: number) => void }) =>
      importsApi.upload(v.file, v.categoryId, v.language, v.onProgress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['import-jobs'] }),
  });
}

export function useCancelImport() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: importsApi.cancel, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['import-jobs'] }) });
}

export function useMarkImportSeen() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: importsApi.markSeen, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['import-jobs'] }) });
}
