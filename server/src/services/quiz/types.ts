// ============================================================
// services/quiz/types.ts — Dữ liệu của bài kiểm tra + luật kiểm tra (zod)
// ============================================================
// Một câu hỏi lưu trong cột Questions (JSON) của WebManualQuizzes:
//   { id, type, text, options: [{ id, text }], correct: [optionId...], source }
//
//   single    — 3 đáp án, đúng 1
//   multiple  — 3 đáp án, đúng từ 2 trở lên (chọn ĐỦ và ĐÚNG mới tính điểm)
//   truefalse — 2 đáp án Đúng / Sai
//
// Đáp án có id riêng (không dùng vị trí 0,1,2) vì khi làm bài đáp án bị XÁO
// TRỘN — chấm theo id thì xáo thế nào cũng chấm đúng.

import { z } from 'zod';

export const QUESTION_TYPES = ['single', 'multiple', 'truefalse'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const id = z.string().min(1).max(50);

export const questionSchema = z
  .object({
    id,
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(1, 'Câu hỏi không được để trống').max(1000),
    options: z
      .array(z.object({ id, text: z.string().trim().min(1, 'Đáp án không được để trống').max(500) }))
      .min(2)
      .max(3),
    correct: z.array(id).min(1),
    source: z.object({ title: z.string().max(300), url: z.string().max(500).startsWith('/docs/') }).nullable().default(null),
  })
  .superRefine((q, ctx) => {
    const optionIds = new Set(q.options.map((o) => o.id));
    if (optionIds.size !== q.options.length) ctx.addIssue({ code: 'custom', message: 'Trùng id đáp án' });
    if (q.correct.some((c) => !optionIds.has(c))) ctx.addIssue({ code: 'custom', message: 'Đáp án đúng không nằm trong danh sách đáp án' });
    const n = new Set(q.correct).size;
    if (q.type === 'truefalse' && (q.options.length !== 2 || n !== 1)) {
      ctx.addIssue({ code: 'custom', message: 'Câu Đúng/Sai phải có 2 đáp án và đúng 1' });
    }
    if (q.type === 'single' && n !== 1) ctx.addIssue({ code: 'custom', message: 'Câu một đáp án phải có đúng 1 đáp án đúng' });
    if (q.type === 'multiple' && n < 2) ctx.addIssue({ code: 'custom', message: 'Câu nhiều đáp án phải có từ 2 đáp án đúng' });
  });

export type QuizQuestion = z.infer<typeof questionSchema>;

export type SourceDoc = { id: string; title: string; slug: string };

export const QUIZ_LANGS = ['vi', 'en', 'ja'] as const;
export type QuizLang = (typeof QUIZ_LANGS)[number];

// Chữ "Đúng / Sai" theo ngôn ngữ đề.
export const TRUE_FALSE: Record<QuizLang, [string, string]> = {
  vi: ['Đúng', 'Sai'],
  en: ['True', 'False'],
  ja: ['正しい', '誤り'],
};

// Chấm một câu: tập đáp án chọn PHẢI TRÙNG KHÍT tập đáp án đúng.
export function isAnswerCorrect(q: QuizQuestion, chosen: string[]): boolean {
  const want = new Set(q.correct);
  const got = new Set(chosen);
  return want.size === got.size && [...want].every((c) => got.has(c));
}
