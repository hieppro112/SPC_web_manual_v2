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

// Khu "Nổi bật" trang chủ: 4 bảng top 5. recentViews = lượt xem trong 7 ngày qua.
//   views7 = xem nhiều 7 ngày · views = xem nhiều nhất · likes = nhiều tim nhất · newest = mới nhất
export type TopKind = 'views7' | 'views' | 'likes' | 'newest';
export type TopDoc = DocSummary & { recentViews: number };
export type Tops = Record<TopKind, TopDoc[]>;

export const engagementApi = {
  view: (docId: string) => http.post<void>(`/engagement/${docId}/view`),
  like: (docId: string, liked: boolean) => http.put<{ liked: boolean; likes: number }>(`/engagement/${docId}/like`, { liked }),
  // lang: kèm tiêu đề đã dịch như danh sách ở trang chủ.
  favorites: (lang: string) => http.get<DocSummary[]>(`/engagement/favorites?lang=${lang}`),
  // Các bảng xếp hạng trong một bộ phận (root = id thể loại cấp cao nhất, '' = tất cả).
  tops: (root: string, lang: string) => http.get<Tops>(`/engagement/tops?root=${root}&lang=${lang}`),
  report: (from: string, to: string) => http.get<{ from: string; to: string; rows: EngagementRow[] }>(`/engagement/report?from=${from}&to=${to}`),
  excelUrl: (from: string, to: string) => `/api/engagement/report.xlsx?from=${from}&to=${to}`,
};
