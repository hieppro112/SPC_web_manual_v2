// features/translations/queries.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { translationsApi, type Lang, type TranslationEdit } from './api.ts';

// Đang chờ dịch -> 30 giây hỏi lại một lần, bản dịch có là tự hiện (không cần F5).
export function useDocTranslation(docId: string | undefined, lang: Lang | null) {
  return useQuery({
    queryKey: ['translations', docId, lang],
    queryFn: () => translationsApi.get(docId!, lang!),
    enabled: !!docId && !!lang,
    retry: false,
    refetchInterval: (q) => (q.state.data?.job === 'pending' || q.state.data?.job === 'processing' ? 30_000 : false),
  });
}

export function useSaveTranslation(docId: string, lang: Lang) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TranslationEdit) => translationsApi.save(docId, lang, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translations', docId] });
      void queryClient.invalidateQueries({ queryKey: ['documents', 'list'] });
    },
  });
}

export function useRetranslate(docId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => translationsApi.retranslate(docId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['translations', docId] }),
  });
}
