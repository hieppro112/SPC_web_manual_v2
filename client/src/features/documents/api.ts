// features/documents/api.ts
import { http, toQuery } from '../../lib/http.ts';
import type { Doc, DocInput, DocStatus, DocSummary, DocVersion, DocVersionFull } from '../../lib/types.ts';

// lang: ngôn ngữ người đọc -> server kèm tiêu đề / mô tả đã dịch (nếu có).
// sort: 'views' | 'likes' = xem nhiều / thích nhiều nhất (bỏ trống = mới cập nhật)
export type DocListParams = { q?: string; category?: string; status?: DocStatus; lang?: string; sort?: string };

export const documentsApi = {
  list: (params: DocListParams) => http.get<DocSummary[]>(`/documents${toQuery(params)}`),
  // encodeURIComponent: slug chỉ có a-z0-9- nhưng vẫn mã hóa cho chắc
  // khi người dùng gõ link tay có ký tự lạ.
  getBySlug: (slug: string) => http.get<Doc>(`/documents/slug/${encodeURIComponent(slug)}`),
  getById: (id: string) => http.get<Doc>(`/documents/${encodeURIComponent(id)}`),
  create: (data: DocInput) => http.post<Doc>('/documents', data),
  update: (id: string, data: DocInput) => http.put<Doc>(`/documents/${id}`, data),
  remove: (id: string) => http.delete(`/documents/${id}`),
  versions: (id: string) => http.get<DocVersion[]>(`/documents/${id}/versions`),
  version: (id: string, version: number) => http.get<DocVersionFull>(`/documents/${id}/versions/${version}`),
  restore: (id: string, version: number) => http.post<Doc>(`/documents/${id}/versions/${version}/restore`),
};
