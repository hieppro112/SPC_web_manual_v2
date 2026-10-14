// features/ai/api.ts — Trợ lý AI
import { http, postStream } from '../../lib/http.ts';

export type AiStatus = { enabled: boolean; indexedDocs: number; guestLimit: number; remaining: number | null };

// all = hỏi trên toàn bộ tài liệu, doc = hỏi về bài đang đọc, summary = tóm tắt bài đang đọc
export type AiMode = 'all' | 'doc' | 'summary';
export type AiSource = { title: string; url: string; section?: string };
export type AiHistoryItem = { role: 'user' | 'assistant'; content: string };

export type AiChatRequest = { mode: AiMode; question: string; slug?: string; lang: string; history: AiHistoryItem[] };

// Các dòng server gửi về lần lượt (xem server/src/routes/ai.ts)
export type AiEvent =
  | { type: 'meta'; sources: AiSource[]; remaining: number | null }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const aiApi = {
  status: () => http.get<AiStatus>('/ai/status'),
  chat: (req: AiChatRequest, onEvent: (e: AiEvent) => void, signal: AbortSignal) => postStream<AiEvent>('/ai/chat', req, onEvent, signal),
};
