// features/ai/queries.ts
import { useQuery } from '@tanstack/react-query';
import { aiApi } from './api.ts';

// Server có bật AI không (AI_BASE_URL) + khách còn hỏi được mấy câu.
export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: aiApi.status, staleTime: 60_000, retry: false });
}
