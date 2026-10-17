// features/imports/api.ts — Nhập bài từ PowerPoint (xem server/src/routes/importJobs.ts)
import { http, uploadFile } from '../../lib/http.ts';
import type { QuizLang } from '../quizzes/api.ts';

export type ImportJobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'expired' | 'cancelled';
export type ImportJob = {
  id: string;
  fileName: string;
  categoryName: string | null;
  language: QuizLang;
  slideCount: number;
  status: ImportJobStatus;
  requestedBy: string | null;
  documentSlug: string | null;
  error: string | null;
  completedAt: string | null;
  seenAt: string | null;
  createdAt: string;
};
export type ImportSummary = { slides: number; images: number; tables: number; notes: number; removedLines: string[] };

export const importsApi = {
  upload: (file: File, categoryId: string, language: QuizLang, onProgress?: (percent: number) => void) =>
    uploadFile<{ job: ImportJob; summary: ImportSummary }>('/import-jobs', file, onProgress, { categoryId, language }),
  list: () => http.get<{ timeoutHours: number; jobs: ImportJob[] }>('/import-jobs'),
  unseenCount: () => http.get<{ count: number }>('/import-jobs/unseen-count'),
  markSeen: (id: string) => http.post<void>(`/import-jobs/${id}/seen`),
  cancel: (id: string) => http.post<void>(`/import-jobs/${id}/cancel`),
};
