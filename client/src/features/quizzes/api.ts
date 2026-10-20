// features/quizzes/api.ts — Bài kiểm tra trắc nghiệm (xem server/src/routes/quizzes.ts)
import { http, postStream } from '../../lib/http.ts';

export type QuestionType = 'single' | 'multiple' | 'truefalse';
export type QuizKind = 'practice' | 'exam';
export type QuizStatus = 'draft' | 'published';
export type QuizLang = 'vi' | 'en' | 'ja';

export type QuizOption = { id: string; text: string };
export type QuizSource = { title: string; url: string };
export type QuizQuestion = { id: string; type: QuestionType; text: string; options: QuizOption[]; correct: string[]; source: QuizSource | null };
export type SourceDoc = { id: string; title: string; slug: string };

type QuizBase = {
  id: string;
  title: string;
  kind: QuizKind;
  status: QuizStatus;
  language: QuizLang;
  sourceDocs: SourceDoc[];
  passPercent: number;
  maxAttempts: number;
  dueAt: string | null;
  questionCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// Bài của tôi (người làm bài) — kèm kết quả lần gần nhất của chính mình.
export type MyQuiz = QuizBase & {
  assigned: boolean;
  my: { attempts: number; percentage: number | null; passed: boolean | null; submittedAt: string | null };
  // Còn khóa: phải đọc đủ thời gian MỘT trong các bài này trước (null = được làm).
  mustRead: SourceDoc[] | null;
};
export type ManagedQuiz = QuizBase & { assigneeCount: number; attemptCount: number };
export type FullQuiz = QuizBase & { questions: QuizQuestion[]; assigneeIds: string[] };

export type QuizInput = {
  title: string;
  kind: QuizKind;
  status: QuizStatus;
  language: QuizLang;
  questions: QuizQuestion[];
  sourceDocs: SourceDoc[];
  passPercent: number;
  maxAttempts: number;
  dueAt: string | null;
  assigneeIds: string[];
};

// Đề để làm: KHÔNG có đáp án đúng (server chấm).
export type TakeQuestion = Pick<QuizQuestion, 'id' | 'type' | 'text' | 'options'>;
export type TakePayload = {
  quiz: Pick<QuizBase, 'id' | 'title' | 'kind' | 'status' | 'language' | 'passPercent' | 'maxAttempts' | 'dueAt' | 'sourceDocs'>;
  records: boolean; // lần nộp này có lưu điểm không
  attemptsUsed: number;
  blocked: '' | 'expired' | 'no_attempts_left' | 'must_read';
  mustRead: SourceDoc[] | null;
  questions: TakeQuestion[];
};

export type Answers = Record<string, string[]>;
export type QuestionResult = { questionId: string; chosen: string[]; correct: string[]; isCorrect: boolean; source: QuizSource | null };
export type SubmitResult = {
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  passPercent: number;
  recorded: boolean;
  attemptsUsed: number;
  attemptsLeft: number | null;
  results: QuestionResult[];
};

export type GenerateEvent =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; questions: QuizQuestion[]; sourceDocs: SourceDoc[] }
  | { type: 'error'; message: string };

export type AssignableUser = { id: string; username: string; displayName: string; role: string };

export type ResultRow = {
  userId: string;
  username: string;
  displayName: string;
  assigned: boolean;
  attempts: number;
  score: number | null;
  total: number | null;
  percentage: number | null;
  passed: boolean | null;
  submittedAt: string | null;
};
export type ResultsPayload = {
  quiz: Pick<QuizBase, 'id' | 'title' | 'kind' | 'passPercent' | 'maxAttempts' | 'dueAt' | 'questionCount'>;
  rows: ResultRow[];
};

// Yêu cầu "nhờ Claude tạo đề" (hàng đợi, xem server/src/routes/quizJobs.ts)
export type QuizJobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'expired' | 'cancelled';
export type QuizJob = {
  id: string;
  sourceDocs: SourceDoc[];
  language: QuizLang;
  questionCount: number;
  status: QuizJobStatus;
  requestedBy: string | null;
  quizId: string | null;
  error: string | null;
  completedAt: string | null;
  seenAt: string | null;
  createdAt: string;
};

export const quizJobsApi = {
  create: (body: { docIds: string[]; count: number; language: QuizLang }) => http.post<QuizJob>('/quiz-jobs', body),
  list: () => http.get<{ timeoutHours: number; jobs: QuizJob[] }>('/quiz-jobs'),
  unseenCount: () => http.get<{ count: number }>('/quiz-jobs/unseen-count'),
  markSeen: (id: string) => http.post<void>(`/quiz-jobs/${id}/seen`),
  cancel: (id: string) => http.post<void>(`/quiz-jobs/${id}/cancel`),
};

export const quizzesApi = {
  mine: () => http.get<MyQuiz[]>('/quizzes'),
  manage: () => http.get<ManagedQuiz[]>('/quizzes/manage'),
  users: () => http.get<AssignableUser[]>('/quizzes/users'),
  generate: (body: { docIds: string[]; count: number; language: QuizLang }, onEvent: (e: GenerateEvent) => void, signal: AbortSignal) =>
    postStream<GenerateEvent>('/quizzes/generate', body, onEvent, signal),
  create: (data: QuizInput) => http.post<FullQuiz>('/quizzes', data),
  getForEdit: (id: string) => http.get<FullQuiz>(`/quizzes/${id}/edit`),
  update: (id: string, data: QuizInput) => http.put<FullQuiz>(`/quizzes/${id}`, data),
  remove: (id: string) => http.delete(`/quizzes/${id}`),
  take: (id: string) => http.get<TakePayload>(`/quizzes/${id}/take`),
  submit: (id: string, answers: Answers) => http.post<SubmitResult>(`/quizzes/${id}/submit`, { answers }),
  results: (id: string) => http.get<ResultsPayload>(`/quizzes/${id}/results`),
  // Tải file: dùng thẳng link (trình duyệt tự gửi cookie đăng nhập), không cần fetch.
  excelUrl: (id: string) => `/api/quizzes/${id}/results.xlsx`,
};
