// features/guide/api.ts — Hướng dẫn sử dụng (xem server/src/routes/guide.ts)
import { http } from '../../lib/http.ts';
import type { Role } from '../../lib/types.ts';
import type { QuizLang } from '../quizzes/api.ts';
import type { TaskKey } from './tasks.ts';

export type GuideGroup = 'basic' | 'editor' | 'admin';
export type GuideProgress = {
  tasks: { key: TaskKey; group: GuideGroup }[];
  done: Partial<Record<TaskKey, string>>; // key -> lúc làm xong (ISO)
};
export type GuideDoc = { id: string; title: string; slug: string; desc: string };
export type GuideReportRow = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  done: number;
  total: number;
  lastAt: string | null;
};
// updatedDocs: bài hướng dẫn còn là bản mẫu cũ (chưa ai sửa tay) được cập nhật lên nội dung mới.
export type SeedResult = { createdDocs: number; updatedDocs: number; skippedDocs: number; createdQuizzes: number; skippedQuizzes: number };

export const guideApi = {
  docs: (lang: string) => http.get<{ lang: QuizLang; docs: GuideDoc[] }>(`/guide/docs?lang=${encodeURIComponent(lang)}`),
  progress: () => http.get<GuideProgress>('/guide/progress'),
  complete: (key: TaskKey) => http.post<{ key: TaskKey; firstTime: boolean }>(`/guide/progress/${key}`),
  reset: () => http.delete('/guide/progress'),
  report: () => http.get<{ users: GuideReportRow[] }>('/guide/report'),
  seed: () => http.post<SeedResult>('/guide/seed'),
};
