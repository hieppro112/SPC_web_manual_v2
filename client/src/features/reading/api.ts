// features/reading/api.ts — Thời gian đọc tối thiểu (xem server/src/routes/reading.ts)
import { http } from '../../lib/http.ts';

export type ReadingProgress = { seconds: number; requiredSeconds: number; reachedEnd: boolean; completedAt: string | null };
export type ReadingStatus = {
  requiredSeconds: number | null; // null = bài không bắt buộc
  version: number;
  tracked: boolean; // true = người này bị đếm giờ (quyền "Người dùng" + bài có quy định)
  progress: ReadingProgress | null;
};
export type ReadingReportRow = {
  userId: string;
  username: string;
  displayName: string;
  seconds: number;
  reachedEnd: boolean;
  completedAt: string | null;
  startedAt: string | null;
  lastReadAt: string | null;
};
export type RuledDoc = { id: string; title: string; slug: string; version: number; requiredSeconds: number };

export const readingApi = {
  status: (docId: string) => http.get<ReadingStatus>(`/reading/${docId}`),
  beat: (docId: string, body: { version: number; delta: number; reachedEnd: boolean }) =>
    http.post<{ tracked: boolean; progress?: ReadingProgress }>(`/reading/${docId}/beat`, body),
  ruledDocs: () => http.get<RuledDoc[]>('/reading/report/docs'),
  report: (docId: string) =>
    http.get<{ doc: { id: string; title: string; slug: string; version: number }; requiredSeconds: number | null; rows: ReadingReportRow[] }>(
      `/reading/report/${docId}`,
    ),
  excelUrl: (docId: string) => `/api/reading/report/${docId}/xlsx`,
};

// Phần tử đánh dấu CUỐI bài (DocPage đặt ngay sau nội dung): thấy nó = đã cuộn tới cuối.
export const READING_END_ID = 'reading-end';

export const mmss =(seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
