// ============================================================
// services/reading.ts — "Đọc đủ mới được làm bài"
// ============================================================
// Áp dụng cho quyền "Người dùng" (editor / admin không bị chặn).
// Một đề (ôn tập hoặc kiểm tra) tạo từ các bài nguồn A, B...:
//   - không bài nguồn nào có quy định thời gian đọc  -> làm bài thoải mái
//   - có -> phải đã đọc xong ÍT NHẤT MỘT bài nguồn có quy định (phiên bản hiện tại)
// Trả về danh sách bài cần đọc (để hiện link), hoặc null = được làm bài.

import type { User } from '../repositories/users.ts';
import { completedDocIds, getRules } from '../repositories/reading.ts';
import type { SourceDoc } from './quiz/types.ts';

export type MustRead = SourceDoc[];

export async function mustReadForMany(user: User, quizzes: { id: string; sourceDocs: SourceDoc[] }[]): Promise<Map<string, MustRead>> {
  const result = new Map<string, MustRead>();
  if (user.role !== 'user') return result;
  const ids = quizzes.flatMap((q) => q.sourceDocs.map((d) => Number(d.id))).filter(Number.isInteger);
  const rules = await getRules(ids);
  if (!rules.size) return result;
  const done = await completedDocIds(user.id, [...rules.keys()]);
  for (const quiz of quizzes) {
    const required = quiz.sourceDocs.filter((d) => rules.has(Number(d.id)));
    if (required.length && !required.some((d) => done.has(Number(d.id)))) result.set(quiz.id, required);
  }
  return result;
}

export async function mustReadFor(user: User, quiz: { id: string; sourceDocs: SourceDoc[] }): Promise<MustRead | null> {
  return (await mustReadForMany(user, [quiz])).get(quiz.id) ?? null;
}
