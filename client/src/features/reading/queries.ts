// features/reading/queries.ts
import { useQuery } from '@tanstack/react-query';
import { readingApi } from './api.ts';

export function useReadingStatus(docId: string | undefined) {
  return useQuery({ queryKey: ['reading', docId], queryFn: () => readingApi.status(docId!), enabled: !!docId, retry: false });
}

export function useRuledDocs() {
  return useQuery({ queryKey: ['reading', 'ruled'], queryFn: readingApi.ruledDocs });
}

export function useReadingReport(docId: string | undefined) {
  return useQuery({ queryKey: ['reading', 'report', docId], queryFn: () => readingApi.report(docId!), enabled: !!docId });
}
