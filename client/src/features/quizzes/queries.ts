// features/quizzes/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quizJobsApi, quizzesApi, type Answers, type QuizInput, type QuizLang } from './api.ts';

// ---------- Hàng đợi "nhờ Claude tạo đề" ----------

// Danh sách yêu cầu: hỏi lại mỗi 30 giây khi còn yêu cầu chưa xong
// -> trạng thái tự đổi "Đang chờ" -> "Đã xong" mà không phải F5.
export function useQuizJobs(enabled: boolean) {
  return useQuery({
    queryKey: ['quiz-jobs'],
    queryFn: quizJobsApi.list,
    enabled,
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status === 'pending' || j.status === 'processing') ? 30_000 : false),
  });
}

// Chấm đỏ trên thanh trên cùng: hỏi mỗi phút.
export function useUnseenJobCount(enabled: boolean) {
  return useQuery({ queryKey: ['quiz-jobs', 'unseen'], queryFn: quizJobsApi.unseenCount, enabled, refetchInterval: 60_000, retry: false });
}

export function useCreateQuizJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { docIds: string[]; count: number; language: QuizLang }) => quizJobsApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-jobs'] }),
  });
}

export function useCancelQuizJob() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: quizJobsApi.cancel, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-jobs'] }) });
}

export function useMarkJobSeen() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: quizJobsApi.markSeen, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-jobs'] }) });
}

// ---------- Bộ đề ----------

export function useMyQuizzes() {
  return useQuery({ queryKey: ['quizzes', 'mine'], queryFn: quizzesApi.mine });
}

export function useManagedQuizzes(enabled: boolean) {
  return useQuery({ queryKey: ['quizzes', 'manage'], queryFn: quizzesApi.manage, enabled });
}

export function useAssignableUsers() {
  return useQuery({ queryKey: ['quizzes', 'users'], queryFn: quizzesApi.users, staleTime: 60_000 });
}

export function useQuizForEdit(id: string | undefined) {
  return useQuery({ queryKey: ['quizzes', 'edit', id], queryFn: () => quizzesApi.getForEdit(id!), enabled: !!id, retry: false });
}

// Đề để làm: KHÔNG giữ bộ nhớ đệm (gcTime 0) -> mỗi lần mở / làm lại là xin
// đề mới từ server, câu hỏi + đáp án được xáo lại.
export function useTakeQuiz(id: string | undefined) {
  return useQuery({ queryKey: ['quizzes', 'take', id], queryFn: () => quizzesApi.take(id!), enabled: !!id, retry: false, gcTime: 0, staleTime: Infinity });
}

export function useQuizResults(id: string | undefined) {
  return useQuery({ queryKey: ['quizzes', 'results', id], queryFn: () => quizzesApi.results(id!), enabled: !!id });
}

export function useSaveQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: QuizInput }) => (id ? quizzesApi.update(id, data) : quizzesApi.create(data)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quizzes'] }),
  });
}

export function useDeleteQuiz() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: quizzesApi.remove, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quizzes'] }) });
}

export function useSubmitQuiz(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: Answers) => quizzesApi.submit(id, answers),
    // Danh sách "bài của tôi" có điểm mới.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quizzes', 'mine'] }),
  });
}
