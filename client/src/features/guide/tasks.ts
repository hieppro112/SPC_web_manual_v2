// ============================================================
// features/guide/tasks.ts — Nhiệm vụ thực hành: chữ, biểu tượng, "Chỉ cho tôi"
// ============================================================
// Danh sách nhiệm vụ nào dành cho ai do SERVER quyết định
// (server/src/services/guide/tasks.ts). Ở đây chỉ mô tả cách HIỂN THỊ và
// nút "Chỉ cho tôi" của từng nhiệm vụ:
//   route  — trang cần mở ('doc' = một bài hướng dẫn, null = ở yên trang hiện tại)
//   target — chỗ cần chỉ vào: phần tử có data-tour="..." trên trang đó
//   tour   — nhiệm vụ là xem một tour -> bấm là chạy tour luôn
//   visit  — chỉ cần mở trang là xong (trang quản trị)

import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Compass,
  FilePlus2,
  FolderCog,
  FolderTree,
  History,
  ImagePlus,
  ListOrdered,
  MessageCircle,
  NotebookPen,
  Palette,
  ScrollText,
  Search,
  Share2,
  Smartphone,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { TourId } from './tour/tours.ts';

export const TASK_KEYS = [
  'tour',
  'search',
  'category',
  'readDoc',
  'readGuide',
  'share',
  'personalize',
  'askAi',
  'takeQuiz',
  'editorTour',
  'saveDraft',
  'addStep',
  'addImage',
  'phoneUpload',
  'addVisual',
  'history',
  'createQuiz',
  'adminUsers',
  'adminCategories',
  'quizResults',
] as const;
export type TaskKey = (typeof TASK_KEYS)[number];

type TaskMeta = {
  icon: LucideIcon;
  route?: string | 'doc' | null;
  target?: string;
  tour?: TourId;
  visit?: boolean;
};

// `satisfies Record<TaskKey, ...>`: thêm key mới vào TASK_KEYS mà quên ở đây là TS báo lỗi.
export const TASK_META = {
  tour: { icon: Compass, tour: 'main' },
  search: { icon: Search, route: '/', target: 'search' },
  category: { icon: FolderTree, route: '/', target: 'categories' },
  readDoc: { icon: BookOpen, route: '/', target: 'doc-list' },
  readGuide: { icon: ScrollText, route: '/guide', target: 'guide-docs' },
  share: { icon: Share2, route: 'doc', target: 'share' },
  personalize: { icon: Palette, route: null, target: 'settings' },
  askAi: { icon: MessageCircle, route: null, target: 'ai-chat' },
  takeQuiz: { icon: ClipboardCheck, route: '/quizzes', target: 'quiz-list' },
  editorTour: { icon: Compass, tour: 'editor' },
  saveDraft: { icon: FilePlus2, route: '/new', target: 'editor-save' },
  addStep: { icon: ListOrdered, route: '/new', target: 'add-block' },
  addImage: { icon: ImagePlus, route: '/new', target: 'add-block' },
  phoneUpload: { icon: Smartphone, route: '/new', target: 'add-block' },
  addVisual: { icon: BarChart3, route: '/new', target: 'add-block' },
  history: { icon: History, route: 'doc', target: 'doc-history' },
  createQuiz: { icon: NotebookPen, route: '/quizzes', target: 'quiz-create' },
  adminUsers: { icon: Users, route: '/admin/users', visit: true },
  adminCategories: { icon: FolderCog, route: '/admin/categories', visit: true },
  quizResults: { icon: Trophy, route: '/quizzes', target: 'quiz-results' },
} satisfies Record<TaskKey, TaskMeta>;

// Nhiệm vụ làm được ngay khi lưu tài liệu: xem trong các khối có gì.
// (Gọi sau khi lưu thành công ở trình soạn.)
export function tasksFromBlocks(blocks: { type: string; props: Record<string, unknown> }[]): TaskKey[] {
  const keys: TaskKey[] = ['saveDraft'];
  if (blocks.some((b) => b.type === 'step')) keys.push('addStep');
  if (blocks.some((b) => (b.type === 'image' && b.props.src) || (b.type === 'step' && b.props.image))) keys.push('addImage');
  if (blocks.some((b) => (b.type === 'diagram' && b.props.src) || (b.type === 'chart' && Array.isArray(b.props.rows) && b.props.rows.length > 1))) {
    keys.push('addVisual');
  }
  return keys;
}
