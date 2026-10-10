// features/media/queries.ts
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Media, MediaKind } from '../../lib/types.ts';
import { mediaApi } from './api.ts';

type Uploader = (file: File, onProgress: (percent: number) => void) => Promise<Media>;

// Upload một file kèm % tiến độ. Mặc định upload vào thư viện media;
// trang điện thoại truyền hàm upload-theo-token riêng.
export function useUploadMedia(uploader: Uploader = mediaApi.upload) {
  const [progress, setProgress] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (file: File) => {
      setProgress(0);
      return uploader(file, setProgress);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media'] }),
    onSettled: () => setProgress(null),
  });
  return { upload: mutation.mutateAsync, progress, isUploading: mutation.isPending };
}

// Tạo phiên QR mới. Dùng useQuery (thay vì useMutation) cho việc tạo phiên
// vì: mở hộp thoại là cần có phiên ngay, và StrictMode chạy effect 2 lần
// lúc dev sẽ tạo 2 phiên — useQuery tự gộp thành 1 lần gọi. Đổi `nonce`
// (bấm "Tạo mã mới") thì key đổi -> tạo phiên mới.
export function useNewUploadSession(kind: 'image' | 'video', nonce: number) {
  return useQuery({
    queryKey: ['upload-session', 'new', kind, nonce],
    queryFn: () => mediaApi.createSession(kind),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}

export function useMediaLibrary(kind: MediaKind) {
  return useQuery({ queryKey: ['media', kind], queryFn: () => mediaApi.list(kind) });
}

// Hỏi trạng thái phiên QR mỗi 2 giây cho tới khi điện thoại gửi xong.
// `refetchInterval` là "polling" có sẵn của TanStack Query; trả về false
// thì dừng hỏi.
export function useUploadSessionStatus(token: string | undefined, poll: boolean) {
  return useQuery({
    queryKey: ['upload-session', token],
    queryFn: () => mediaApi.getSession(token!),
    enabled: !!token,
    retry: false,
    refetchInterval: (query) => (poll && query.state.data?.status !== 'done' && !query.state.error ? 2000 : false),
  });
}

export function useServerMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: mediaApi.meta, staleTime: Infinity });
}
