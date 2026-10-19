// ============================================================
// tour/tours.ts — Các bước của từng tour
// ============================================================
// Mỗi bước chỉ vào một phần tử có thuộc tính data-tour="..." trên trang.
// Không tìm thấy phần tử (vd khách không có nút "Tài liệu mới", màn hình
// nhỏ ẩn ô tìm kiếm trên header) -> bước đó tự bỏ qua. Nhờ vậy một tour
// dùng chung cho mọi quyền.
// Chữ của bước nằm trong i18n: guide.steps.<id>.title / .body

import type { TaskKey } from '../tasks.ts';

export type StepId =
  | 'welcome'
  | 'search'
  | 'categories'
  | 'docList'
  | 'aiChat'
  | 'quizzes'
  | 'newDoc'
  | 'import'
  | 'settings'
  | 'account'
  | 'help'
  | 'done'
  | 'editorWelcome'
  | 'editorTitle'
  | 'editorCategory'
  | 'editorBlock'
  | 'editorAddBlock'
  | 'editorMode'
  | 'editorStatus'
  | 'editorSave'
  | 'editorDone';

export type TourStep = {
  id: StepId;
  target?: string; // data-tour; không có = thẻ giữa màn hình
  route?: string; // trang cần mở trước khi chỉ
};

export type TourId = 'main' | 'editor';

export const TOURS: Record<TourId, { steps: TourStep[]; task: TaskKey }> = {
  main: {
    task: 'tour',
    steps: [
      { id: 'welcome', route: '/' },
      { id: 'search', target: 'search' },
      { id: 'categories', target: 'categories' },
      { id: 'docList', target: 'doc-list' },
      { id: 'aiChat', target: 'ai-chat' },
      { id: 'quizzes', target: 'quizzes' },
      { id: 'newDoc', target: 'new-doc' },
      { id: 'import', target: 'import' },
      { id: 'settings', target: 'settings' },
      { id: 'account', target: 'account' },
      { id: 'help', target: 'help' },
      { id: 'done' },
    ],
  },
  editor: {
    task: 'editorTour',
    steps: [
      { id: 'editorWelcome', route: '/new' },
      { id: 'editorTitle', target: 'editor-title' },
      { id: 'editorCategory', target: 'editor-category' },
      { id: 'editorBlock', target: 'block-card' },
      { id: 'editorAddBlock', target: 'add-block' },
      { id: 'editorMode', target: 'editor-mode' },
      { id: 'editorStatus', target: 'editor-status' },
      { id: 'editorSave', target: 'editor-save' },
      { id: 'editorDone' },
    ],
  },
};
