// ============================================================
// existing.ts — "các bài đang chọn đã có đề nào chưa?"
// ============================================================
// Hàm thuần (không gọi API, không state): nhận danh sách đề + yêu cầu Claude đang chờ,
// trả về những cái có dùng ÍT NHẤT MỘT tài liệu đang chọn.
// Tách riêng để trang tạo đề, danh sách chọn bài và hộp thoại xác nhận dùng chung một luật.
// 🔸 Flutter: giống một hàm top-level trong file utils.dart, widget nào cũng gọi được.

import type { ManagedQuiz, QuizJob, SourceDoc } from './api.ts';

export type Related = {
  kind: 'quiz' | 'job';
  id: string;
  title: string;
  sourceDocs: SourceDoc[];
  // Bộ tài liệu của đề GIỐNG HỆT bộ đang chọn (không thừa, không thiếu) -> gần như chắc chắn trùng.
  exact: boolean;
  // Bao nhiêu tài liệu đang chọn có trong đề này.
  shared: number;
  quiz?: ManagedQuiz;
  job?: QuizJob;
};

// Đếm số đề (kể cả nháp) có dùng một tài liệu -> hiện badge "Đã có N đề" cạnh từng bài.
export function quizCountByDoc(quizzes: ManagedQuiz[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of quizzes) for (const d of q.sourceDocs) counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
  return counts;
}

// Đề + yêu cầu đang chờ có dùng tài liệu đang chọn. Xếp: trùng hoàn toàn trước,
// rồi tới cái chung nhiều bài hơn.
export function findRelated(selectedIds: string[], quizzes: ManagedQuiz[], activeJobs: QuizJob[]): Related[] {
  if (!selectedIds.length) return [];
  const selected = new Set(selectedIds);
  const build = (kind: Related['kind'], id: string, title: string, sourceDocs: SourceDoc[], extra: Pick<Related, 'quiz' | 'job'>): Related | null => {
    const shared = sourceDocs.filter((d) => selected.has(d.id)).length;
    if (!shared) return null;
    return { kind, id, title, sourceDocs, shared, exact: shared === selected.size && sourceDocs.length === selected.size, ...extra };
  };
  const list = [
    ...quizzes.map((q) => build('quiz', q.id, q.title, q.sourceDocs, { quiz: q })),
    ...activeJobs.map((j) => build('job', j.id, j.sourceDocs.map((d) => d.title).join(', '), j.sourceDocs, { job: j })),
  ].filter((r): r is Related => r !== null);
  return list.sort((a, b) => Number(b.exact) - Number(a.exact) || b.shared - a.shared);
}
