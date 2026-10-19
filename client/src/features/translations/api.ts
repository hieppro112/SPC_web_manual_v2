// features/translations/api.ts — Bản dịch tự động (xem server/src/routes/translations.ts)
import type { Block } from '../../blocks/types.ts';
import { http } from '../../lib/http.ts';
import type { QuizLang as Lang } from '../quizzes/api.ts';

export type { Lang };
export const LANGS: Lang[] = ['vi', 'en', 'ja'];

export type TranslationView = {
  available: boolean; // false: server chưa bật / chưa tạo bảng 007 / bài hướng dẫn
  sourceLang: Lang;
  lang: Lang;
  // original: đang xem đúng ngôn ngữ gốc · missing: chưa có bản dịch
  // ready: dịch đủ · partial: có khối mới sửa chưa kịp dịch (tạm hiện chữ gốc)
  status?: 'original' | 'missing' | 'ready' | 'partial';
  job?: 'pending' | 'processing' | 'failed' | null;
  title?: string;
  blocks?: Block[];
  translatedIds?: string[];
  untranslated?: number;
  editedBy?: string | null;
  editedAt?: string | null;
};

export type TranslationEdit = { title: string; blocks: Record<string, Record<string, string>> };

export const translationsApi = {
  get: (docId: string, lang: Lang) => http.get<TranslationView>(`/translations/${docId}?lang=${lang}`),
  save: (docId: string, lang: Lang, body: TranslationEdit) => http.put<void>(`/translations/${docId}/${lang}`, body),
  retranslate: (docId: string) => http.post<void>(`/translations/${docId}/retranslate`),
};
