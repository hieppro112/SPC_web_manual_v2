// ============================================================
// services/guide/seed.ts — Nạp bài hướng dẫn + bài ôn tập mẫu
// ============================================================
// Admin bấm "Nạp bài hướng dẫn mẫu" -> tạo những gì CÒN THIẾU:
//   Thể loại "Hướng dẫn sử dụng"
//   7 bài hướng dẫn tiếng Việt (slug cố định guide-vi-0X-...). Bản tiếng Anh /
//     tiếng Nhật do tính năng dịch tự động tạo, không viết tay nữa.
//   3 bài ôn tập (vi / en / ja). "Xem lại" mở bài gốc với ?lang= của đề.
// Cái đã có thì GIỮ NGUYÊN (kể cả đã bị sửa) -> bấm lại bao nhiêu lần cũng an toàn.
// Riêng bài ôn tập cũ có link "Xem lại" trỏ vào bản en/ja viết tay (đã bỏ) thì được
// sửa link về bài gốc.
// Chỉ ghi dữ liệu (INSERT / UPDATE), không tạo bảng -> tài khoản kvh_write làm được.

import { parseBlocks } from '../../blocks/schemas.ts';
import { createCategory } from '../../repositories/categories.ts';
import { findDocumentBySlug, slugExists } from '../../repositories/documents.ts';
import { findCategoryIdByName, findQuizIdByTitle } from '../../repositories/guide.ts';
import { createQuiz, findQuiz, updateQuiz } from '../../repositories/quizzes.ts';
import { createDocument } from '../documents.ts';
import { QUIZ_LANGS, questionSchema, type QuizLang, type QuizQuestion } from '../quiz/types.ts';
import { en } from './content/en.ts';
import { ja } from './content/ja.ts';
import { toBlocks, type GuideQuiz } from './content/types.ts';
import { vi } from './content/vi.ts';

export const GUIDE_DOCS = vi.docs;
const QUIZZES: Record<QuizLang, GuideQuiz> = { vi: vi.quiz, en, ja };
const ROOT_CATEGORY = 'Hướng dẫn sử dụng';

// Link "Xem lại": bài gốc tiếng Việt; đề tiếng Anh / Nhật thì mở bản dịch tương ứng.
const reviewUrl = (slug: string, lang: QuizLang) => `/docs/${slug}${lang === 'vi' ? '' : `?lang=${lang}`}`;

// Link cũ trỏ vào bản viết tay "guide-en-03-..." -> bài gốc "guide-vi-03-..." cùng số thứ tự.
function fixLegacySource(q: QuizQuestion, lang: QuizLang): QuizQuestion {
  const m = q.source?.url.match(/^\/docs\/guide-(?:en|ja)-(\d\d)-/);
  const doc = m && GUIDE_DOCS.find((d) => d.slug.startsWith(`guide-vi-${m[1]}-`));
  return doc && q.source ? { ...q, source: { title: q.source.title, url: reviewUrl(doc.slug, lang) } } : q;
}

export type SeedResult = { createdDocs: number; skippedDocs: number; createdQuizzes: number; skippedQuizzes: number };

export async function seedGuide(userId: number): Promise<SeedResult> {
  const result: SeedResult = { createdDocs: 0, skippedDocs: 0, createdQuizzes: 0, skippedQuizzes: 0 };
  // Tạo mới thì đánh dấu "Dùng chung": mọi bộ phận (và khách) đều đọc được hướng dẫn.
  const categoryId =
    (await findCategoryIdByName(ROOT_CATEGORY, null)) ?? Number((await createCategory(ROOT_CATEGORY, 'BookOpen', null, true)).id);

  // Bài hướng dẫn: tạo theo thứ tự 01, 02... (slug cố định để trang /guide nhận ra).
  for (const doc of GUIDE_DOCS) {
    if (await slugExists(doc.slug)) {
      result.skippedDocs++;
      continue;
    }
    // parseBlocks: cùng luật kiểm tra như khi người dùng lưu -> nội dung mẫu sai là báo ngay.
    const blocks = parseBlocks(toBlocks(doc.slug, doc.blocks));
    await createDocument({ title: doc.title, categoryId, status: 'published', blocks }, userId, doc.slug);
    result.createdDocs++;
  }

  for (const lang of QUIZ_LANGS) {
    const quiz = QUIZZES[lang];
    const existingId = await findQuizIdByTitle(quiz.title);
    if (existingId) {
      result.skippedQuizzes++;
      await repairQuizLinks(existingId, lang, userId);
      continue;
    }
    const questions = quiz.questions.map((q, i) => {
      const options = q.options.map((text, k) => ({ id: `o${k + 1}`, text }));
      const title = quiz.docTitles?.[q.doc] ?? GUIDE_DOCS.find((d) => d.slug === q.doc)?.title ?? '';
      return questionSchema.parse({
        id: `q${i + 1}`,
        type: q.type,
        text: q.text,
        options,
        correct: q.correct.map((k) => options[k]!.id),
        source: { title, url: reviewUrl(q.doc, lang) },
      });
    });
    // Nguồn của đề = các bài hướng dẫn có mặt trong DB (vừa tạo hoặc đã có).
    const sourceDocs = [];
    for (const slug of new Set(quiz.questions.map((q) => q.doc))) {
      const doc = await findDocumentBySlug(slug);
      if (doc) sourceDocs.push({ id: doc.id, title: doc.title, slug: doc.slug });
    }
    await createQuiz(
      { title: quiz.title, kind: 'practice', status: 'published', language: lang, questions, sourceDocs, passPercent: 85, maxAttempts: 3, dueAt: null, assigneeIds: [] },
      userId,
    );
    result.createdQuizzes++;
  }
  return result;
}

// Bài ôn tập đã nạp từ bản cũ: sửa link "Xem lại" (nếu còn trỏ vào bản en/ja viết tay).
async function repairQuizLinks(quizId: number, lang: QuizLang, userId: number): Promise<void> {
  const quiz = await findQuiz(quizId);
  if (!quiz) return;
  const questions = quiz.questions.map((q) => fixLegacySource(q, lang));
  if (JSON.stringify(questions) === JSON.stringify(quiz.questions)) return;
  const sourceDocs = [];
  for (const doc of GUIDE_DOCS) {
    const found = await findDocumentBySlug(doc.slug);
    if (found && questions.some((q) => q.source?.url.startsWith(`/docs/${doc.slug}`))) sourceDocs.push({ id: found.id, title: found.title, slug: found.slug });
  }
  await updateQuiz(
    quizId,
    {
      title: quiz.title,
      kind: quiz.kind,
      status: quiz.status,
      language: quiz.language,
      questions,
      sourceDocs,
      passPercent: quiz.passPercent,
      maxAttempts: quiz.maxAttempts,
      dueAt: quiz.dueAt,
      assigneeIds: quiz.assigneeIds.map(Number),
    },
    userId,
  );
}
