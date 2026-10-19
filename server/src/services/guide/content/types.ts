// ============================================================
// services/guide/content/types.ts — Cách viết gọn nội dung bài hướng dẫn
// ============================================================
// Viết khối bằng mảng ngắn cho dễ đọc, rồi đổi sang khối thật của tài liệu:
//   ['h2', 'Tên mục']                       -> heading cấp 2
//   ['p', 'Đoạn văn **Markdown**']           -> paragraph
//   ['step', 'Tên bước', 'Mô tả']            -> step
//   ['tip' | 'info' | 'warn' | 'danger', '...'] -> callout
//   ['table', [['Cột 1', 'Cột 2'], [...]]]  -> table (hàng đầu là tiêu đề)
//   ['check', ['Mục 1', 'Mục 2']]           -> checklist
//   ['hr']                                   -> divider

import type { QuestionType } from '../../quiz/types.ts';

export type GuideBlock =
  | ['h2' | 'h3' | 'p', string]
  | ['step', string, string]
  | ['tip' | 'info' | 'warn' | 'danger', string]
  | ['table', string[][]]
  | ['check', string[]]
  | ['hr'];

export type GuideDoc = { slug: string; title: string; blocks: GuideBlock[] };

// correct: vị trí đáp án đúng (0, 1, 2); doc: slug bài hướng dẫn (bản gốc tiếng Việt) để "Xem lại".
export type GuideQuestion = { type: QuestionType; text: string; options: string[]; correct: number[]; doc: string };

// docTitles: tên bài theo ngôn ngữ của đề (hiện ở link "Xem lại"); không có thì dùng tên bài gốc.
export type GuideQuiz = { title: string; docTitles?: Record<string, string>; questions: GuideQuestion[] };

// Bài hướng dẫn chỉ viết MỘT bản (tiếng Việt); bản tiếng Anh / Nhật do tính năng dịch tự tạo.
export type GuideContent = { docs: GuideDoc[]; quiz: GuideQuiz };

const CALLOUT = { tip: 'success', info: 'info', warn: 'warning', danger: 'danger' } as const;

export function toBlocks(slug: string, list: GuideBlock[]) {
  return list.map((b, i) => {
    const id = `${slug}-${i + 1}`;
    switch (b[0]) {
      case 'h2':
      case 'h3':
        return { id, type: 'heading', props: { text: b[1], level: b[0] === 'h2' ? 2 : 3 } };
      case 'p':
        return { id, type: 'paragraph', props: { text: b[1] } };
      case 'step':
        return { id, type: 'step', props: { title: b[1], text: b[2], image: '' } };
      case 'tip':
      case 'info':
      case 'warn':
      case 'danger':
        return { id, type: 'callout', props: { variant: CALLOUT[b[0]], text: b[1] } };
      case 'table':
        return { id, type: 'table', props: { header: true, rows: b[1] } };
      case 'check':
        return { id, type: 'checklist', props: { items: b[1].map((text, k) => ({ id: `${id}-${k + 1}`, text })) } };
      case 'hr':
        return { id, type: 'divider', props: {} };
    }
  });
}
