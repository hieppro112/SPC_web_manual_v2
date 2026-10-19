// ============================================================
// services/guide/tasks.ts — Danh sách "nhiệm vụ thực hành"
// ============================================================
// Mỗi nhiệm vụ là một việc thật trên web (tìm kiếm, mở tài liệu, lưu bài nháp...).
// Client làm xong việc nào thì báo POST /api/guide/progress/:key; server chỉ
// nhận key có trong danh sách này VÀ hợp với quyền của người đó.
// Chữ hiển thị + nút "Chỉ cho tôi" nằm ở client (features/guide/tasks.ts),
// cùng các key dưới đây.
//
// Thêm nhiệm vụ mới: thêm vào đây + thêm vào client (TS báo lỗi nếu thiếu chữ).

import { config } from '../../config.ts';
import type { Role } from '../../repositories/users.ts';

export type GuideGroup = 'basic' | 'editor' | 'admin';

type TaskDef = { key: string; group: GuideGroup; needsAi?: boolean };

export const GUIDE_TASKS: TaskDef[] = [
  // Ai đăng nhập cũng làm (kể cả role "user")
  { key: 'tour', group: 'basic' },
  { key: 'search', group: 'basic' },
  { key: 'category', group: 'basic' },
  { key: 'readDoc', group: 'basic' },
  { key: 'readGuide', group: 'basic' },
  { key: 'share', group: 'basic' },
  { key: 'personalize', group: 'basic' },
  { key: 'askAi', group: 'basic', needsAi: true },
  { key: 'takeQuiz', group: 'basic' },
  // Biên tập + admin
  { key: 'editorTour', group: 'editor' },
  { key: 'saveDraft', group: 'editor' },
  { key: 'addStep', group: 'editor' },
  { key: 'addImage', group: 'editor' },
  { key: 'phoneUpload', group: 'editor' },
  { key: 'addVisual', group: 'editor' },
  { key: 'history', group: 'editor' },
  { key: 'createQuiz', group: 'editor' },
  // Chỉ admin
  { key: 'adminUsers', group: 'admin' },
  { key: 'adminCategories', group: 'admin' },
  { key: 'quizResults', group: 'admin' },
];

const GROUPS_BY_ROLE: Record<Role, GuideGroup[]> = {
  user: ['basic'],
  editor: ['basic', 'editor'],
  admin: ['basic', 'editor', 'admin'],
};

// Nhiệm vụ dành cho một quyền. Server chưa bật AI thì bỏ nhiệm vụ "hỏi AI".
export function tasksForRole(role: Role): TaskDef[] {
  const groups = GROUPS_BY_ROLE[role];
  return GUIDE_TASKS.filter((t) => groups.includes(t.group) && (!t.needsAi || !!config.ai.baseUrl));
}
