// features/engagement/api.ts — Lượt xem 👁 + thả tim ❤ (xem server/src/routes/engagement.ts)
import { http } from '../../lib/http.ts';
import type { DocSummary } from '../../lib/types.ts';

export type EngagementRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  category: string | null;
  views: number;
  viewers: number;
  likes: number;
  totalLikes: number;
};

export const engagementApi = {
  view: (docId: string) => http.post<void>(`/engagement/${docId}/view`),
  like: (docId: string, liked: boolean) => http.put<{ liked: boolean; likes: number }>(`/engagement/${docId}/like`, { liked }),
  favorites: () => http.get<DocSummary[]>('/engagement/favorites'),
  report: (from: string, to: string) => http.get<{ from: string; to: string; rows: EngagementRow[] }>(`/engagement/report?from=${from}&to=${to}`),
  excelUrl: (from: string, to: string) => `/api/engagement/report.xlsx?from=${from}&to=${to}`,
};
