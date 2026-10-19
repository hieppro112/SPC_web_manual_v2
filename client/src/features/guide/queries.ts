// ============================================================
// features/guide/queries.ts — hook của "Hướng dẫn & thực hành"
// ============================================================
// useCompleteTask(): các trang gọi complete('search'), complete('share')...
// khi người dùng làm đúng việc. Hàm tự bỏ qua nếu là khách, nhiệm vụ đã
// xong, hoặc nhiệm vụ không dành cho quyền này -> gọi thoải mái, không tốn request.

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCurrentUser } from '../auth/queries.ts';
import { guideApi, type GuideProgress } from './api.ts';
import type { TaskKey } from './tasks.ts';

const progressKey = (userId: string | undefined) => ['guide', 'progress', userId] as const;

export function useGuideProgress() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: progressKey(user?.id),
    queryFn: guideApi.progress,
    enabled: !!user,
    staleTime: 60_000,
    retry: false, // chưa tạo bảng 006 -> báo lỗi ngay, không thử lại
  });
}

export function useGuideDocs(lang: string) {
  return useQuery({ queryKey: ['guide', 'docs', lang], queryFn: () => guideApi.docs(lang) });
}

// Nhiệm vụ đang gửi / đã gửi xong trong phiên này (tránh gửi trùng khi một việc
// kích hoạt nhiều lần liền, vd gõ tìm kiếm nhiều lần).
const inFlight = new Set<string>();
const sent = new Set<string>();

export function useCompleteTask() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const userId = user?.id;

  return useCallback(
    (key: TaskKey) => {
      if (!userId) return;
      const query = queryClient.getQueryState<GuideProgress>(progressKey(userId));
      const data = query?.data;
      if (query?.status === 'error') return; // server chưa sẵn sàng (thiếu bảng 006)
      if (data && (data.done[key] || !data.tasks.some((task) => task.key === key))) return;
      const flightKey = `${userId}:${key}`;
      if (inFlight.has(flightKey) || (sent.has(flightKey) && !data)) return;
      inFlight.add(flightKey);

      guideApi
        .complete(key)
        .then((res) => {
          sent.add(flightKey);
          const now = new Date().toISOString();
          queryClient.setQueryData<GuideProgress>(progressKey(userId), (old) => (old ? { ...old, done: { ...old.done, [key]: now } } : old));
          if (!res.firstTime) return;
          const updated = queryClient.getQueryData<GuideProgress>(progressKey(userId));
          const allDone = updated && updated.tasks.every((task) => updated.done[task.key]);
          if (allDone) toast.success(t('guide.allDone'), { duration: 8000 });
          else toast.success(t('guide.taskDone', { title: t(`guide.tasks.${key}.title`) }));
        })
        // Báo tiến độ lỗi thì thôi: không làm phiền người đang làm việc chính.
        .catch(() => {})
        .finally(() => inFlight.delete(flightKey));
    },
    [userId, queryClient, t],
  );
}

// Mở trang là xong nhiệm vụ (vd trang quản trị, trang lịch sử).
export function useCompleteOnMount(key: TaskKey, when = true) {
  const complete = useCompleteTask();
  const { isSuccess } = useGuideProgress();
  useEffect(() => {
    // Đợi tải xong tiến độ để biết nhiệm vụ đã xong chưa (khỏi gửi thừa).
    if (when && isSuccess) complete(key);
  }, [complete, key, when, isSuccess]);
}

export function useResetGuide() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: guideApi.reset, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guide', 'progress'] }) });
}

export function useGuideReport(enabled: boolean) {
  return useQuery({ queryKey: ['guide', 'report'], queryFn: guideApi.report, enabled, retry: false });
}

export function useSeedGuide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: guideApi.seed,
    // Có bài + thể loại + đề mới -> làm mới các danh sách liên quan.
    onSuccess: () => {
      for (const key of ['guide', 'documents', 'categories', 'quizzes']) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}
