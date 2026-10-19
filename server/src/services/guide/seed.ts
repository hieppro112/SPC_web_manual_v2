// ============================================================
// services/guide/seed.ts — Nạp bài hướng dẫn + bài ôn tập mẫu
// ============================================================
// Admin bấm "Nạp bài hướng dẫn mẫu" -> tạo những gì CÒN THIẾU:
//   Thể loại "Hướng dẫn sử dụng" › "Tiếng Việt" / "English" / "日本語"
//   7 bài hướng dẫn mỗi ngôn ngữ (slug cố định guide-<lang>-0X-...)
//   1 bài ôn tập mỗi ngôn ngữ
// Cái đã có thì GIỮ NGUYÊN (kể cả đã bị sửa) -> bấm lại bao nhiêu lần cũng an toàn.
// Chỉ ghi dữ liệu (INSERT), không tạo bảng -> tài khoản kvh_write làm được.

import { parseBlocks } from '../../blocks/schemas.ts';
import { createCategory } from '../../repositories/categories.ts';
import { findDocumentBySlug, slugExists } from '../../repositories/documents.ts';
import { findCategoryIdByName, findQuizIdByTitle } from '../../repositories/guide.ts';
import { createQuiz } from '../../repositories/quizzes.ts';
import { createDocument } from '../documents.ts';
import { QUIZ_LANGS, questionSchema, type QuizLang } from '../quiz/types.ts';
import { en } from './content/en.ts';
import { ja } from './content/ja.ts';
import { toBlocks, type GuideContent } from './content/types.ts';
import { vi } from './content/vi.ts';

export const GUIDE_CONTENT: Record<QuizLang, GuideContent> = { vi, en, ja };
export const GUIDE_LANGS = QUIZ_LANGS;
const ROOT_CATEGORY = 'Hướng dẫn sử dụng';

async function ensureCategory(name: string, iconName: string, parentId: number | null): Promise<number> {
  return (await findCategoryIdByName(name, parentId)) ?? Number((await createCategory(name, iconName, parentId)).id);
}

export type SeedResult = { createdDocs: number; skippedDocs: number; createdQuizzes: number; skippedQuizzes: number };

export async function seedGuide(langs: readonly QuizLang[], userId: number): Promise<SeedResult> {
  const result: SeedResult = { createdDocs: 0, skippedDocs: 0, createdQuizzes: 0, skippedQuizzes: 0 };
  const rootId = await ensureCategory(ROOT_CATEGORY, 'BookOpen', null);

  for (const lang of langs) {
    const content = GUIDE_CONTENT[lang];
    const categoryId = await ensureCategory(content.categoryName, 'Globe', rootId);

    // Bài hướng dẫn: tạo theo thứ tự 01, 02... (slug cố định để trang /guide nhận ra).
    for (const doc of content.docs) {
      if (await slugExists(doc.slug)) {
        result.skippedDocs++;
        continue;
      }
      // parseBlocks: cùng luật kiểm tra như khi người dùng lưu -> nội dung mẫu sai là báo ngay.
      const blocks = parseBlocks(toBlocks(doc.slug, doc.blocks));
      await createDocument({ title: doc.title, categoryId, status: 'published', blocks }, userId, doc.slug);
      result.createdDocs++;
    }

    // Bài ôn tập (practice): nhận ra bằng tên.
    if (await findQuizIdByTitle(content.quiz.title)) {
      result.skippedQuizzes++;
      continue;
    }
    const titles = new Map(content.docs.map((d) => [d.slug, d.title]));
    const questions = content.quiz.questions.map((q, i) => {
      const options = q.options.map((text, k) => ({ id: `o${k + 1}`, text }));
      return questionSchema.parse({
        id: `q${i + 1}`,
        type: q.type,
        text: q.text,
        options,
        correct: q.correct.map((k) => options[k]!.id),
        source: { title: titles.get(q.doc) ?? '', url: `/docs/${q.doc}` },
      });
    });
    // Nguồn của đề = các bài hướng dẫn có mặt trong DB (vừa tạo hoặc đã có).
    const sourceDocs = [];
    for (const slug of new Set(content.quiz.questions.map((q) => q.doc))) {
      const doc = await findDocumentBySlug(slug);
      if (doc) sourceDocs.push({ id: doc.id, title: doc.title, slug: doc.slug });
    }
    await createQuiz(
      {
        title: content.quiz.title,
        kind: 'practice',
        status: 'published',
        language: lang,
        questions,
        sourceDocs,
        passPercent: 85,
        maxAttempts: 3,
        dueAt: null,
        assigneeIds: [],
      },
      userId,
    );
    result.createdQuizzes++;
  }
  return result;
}
