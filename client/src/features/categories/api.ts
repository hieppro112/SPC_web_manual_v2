// features/categories/api.ts
import { http } from '../../lib/http.ts';
import type { Category } from '../../lib/types.ts';

// parentId: null = cấp cao nhất
export type CategoryInput = { name: string; iconName: string; parentId: string | null; isShared?: boolean };

// Mục mặc định của mọi bộ phận (cây; parentId null = mục con trực tiếp của bộ phận).
export type CategoryTemplate = { id: string; name: string; iconName: string; parentId: string | null };
export type TemplateInput = Omit<CategoryTemplate, 'id'>;

// Đề xuất thể loại mới của biên tập. parentPath: "PE IT › Biểu mẫu".
export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type CategoryRequest = {
  id: string;
  parentId: string;
  parentPath: string;
  name: string;
  iconName: string;
  note: string;
  status: RequestStatus;
  rejectReason: string | null;
  categoryId: string | null;
  requestedBy: { id: string; displayName: string };
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};
export type RequestInput = { parentId: string; name: string; iconName: string; note: string };

export const categoriesApi = {
  list: () => http.get<Category[]>('/categories'),
  // Tạo bộ phận (cấp cao nhất, không dùng chung) -> server tự thêm mục mặc định, báo lại số mục đã tạo.
  create: (data: CategoryInput) => http.post<Category & { defaultsCreated: number }>('/categories', data),
  update: (id: string, data: Partial<CategoryInput>) => http.put<Category>(`/categories/${id}`, data),
  remove: (id: string) => http.delete(`/categories/${id}`),
  syncDefaults: () => http.post<{ created: number }>('/categories/sync-defaults'),
};

export const templatesApi = {
  list: () => http.get<CategoryTemplate[]>('/category-templates'),
  create: (data: TemplateInput) => http.post<CategoryTemplate>('/category-templates', data),
  update: (id: string, data: Partial<TemplateInput>) => http.put<CategoryTemplate>(`/category-templates/${id}`, data),
  remove: (id: string) => http.delete(`/category-templates/${id}`),
  // Thêm mục này vào mọi bộ phận (chỗ nào còn thiếu).
  apply: (id: string) => http.post<{ created: number }>(`/category-templates/${id}/apply`),
};

export const requestsApi = {
  create: (data: RequestInput) => http.post<CategoryRequest>('/category-requests', data),
  mine: () => http.get<CategoryRequest[]>('/category-requests/mine'),
  cancel: (id: string) => http.delete(`/category-requests/${id}`),
  list: (status: RequestStatus) => http.get<CategoryRequest[]>(`/category-requests?status=${status}`),
  pendingCount: () => http.get<{ count: number }>('/category-requests/pending-count'),
  approve: (id: string, data: { name: string; iconName: string }) => http.post<Category>(`/category-requests/${id}/approve`, data),
  reject: (id: string, reason: string) => http.post<void>(`/category-requests/${id}/reject`, { reason }),
};
