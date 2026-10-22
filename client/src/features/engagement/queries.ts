// features/engagement/queries.ts
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Doc } from '../../lib/types.ts';
import { engagementApi } from './api.ts';

// Mở bài -> ghi một lượt xem (server tự bỏ qua nếu hôm nay người này đã xem).
// Lỗi thì thôi: đếm lượt xem không được làm phiền người đọc.
export function useRecordView(docId: string | undefined) {
  useEffect(() => {
    if (docId) engagementApi.view(docId).catch(() => {});
  }, [docId]);
}

// Thả / bỏ tim. "Lạc quan": đổi số trên màn hình NGAY, server trả về thì chỉnh lại cho đúng.
// 🔸 Flutter: giống setState trước rồi gọi API, lỗi thì setState trả lại như cũ.
export function useToggleLike(slug: string) {
  const queryClient = useQueryClient();
  const key = ['documents', 'slug', slug];
  return useMutation({
    mutationFn: ({ docId, liked }: { docId: string; liked: boolean }) => engagementApi.like(docId, liked),
    onMutate: ({ liked }) => {
      const before = queryClient.getQueryData<Doc>(key);
      queryClient.setQueryData<Doc>(key, (doc) =>
        doc?.stats ? { ...doc, stats: { ...doc.stats, likedByMe: liked, likes: Math.max(0, doc.stats.likes + (liked ? 1 : -1)) } } : doc,
      );
      return { before };
    },
    onError: (_err, _vars, context) => queryClient.setQueryData(key, context?.before),
    onSuccess: (res) =>
      queryClient.setQueryData<Doc>(key, (doc) => (doc?.stats ? { ...doc, stats: { ...doc.stats, likedByMe: res.liked, likes: res.likes } } : doc)),
    // Danh sách (số tim trên thẻ) + trang yêu thích làm mới sau.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['engagement', 'favorites'] });
    },
  });
}

export function useFavorites() {
  return useQuery({ queryKey: ['engagement', 'favorites'], queryFn: engagementApi.favorites });
}

export function useEngagementReport(from: string, to: string) {
  return useQuery({ queryKey: ['engagement', 'report', from, to], queryFn: () => engagementApi.report(from, to), enabled: !!from && !!to });
}
