// features/media/api.ts — upload file, thư viện media, phiên QR
import { http, uploadFile } from '../../lib/http.ts';
import type { Media, MediaKind, ServerMeta, UploadSession, UploadSessionStatus } from '../../lib/types.ts';

export const mediaApi = {
  upload: (file: File, onProgress?: (percent: number) => void) => uploadFile<Media>('/media', file, onProgress),
  list: (kind: MediaKind) => http.get<Media[]>(`/media?kind=${kind}`),

  createSession: (kind: 'image' | 'video') => http.post<UploadSession>('/upload-sessions', { kind }),
  getSession: (token: string) => http.get<UploadSessionStatus>(`/upload-sessions/${token}`),
  uploadToSession: (token: string, file: File, onProgress?: (percent: number) => void) =>
    uploadFile<Media>(`/upload-sessions/${token}/file`, file, onProgress),

  meta: () => http.get<ServerMeta>('/meta'),
};
