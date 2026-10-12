// features/categories/api.ts
import { http } from '../../lib/http.ts';
import type { Category } from '../../lib/types.ts';

// parentId: null = cấp cao nhất
export type CategoryInput = { name: string; iconName: string; parentId: string | null };

export const categoriesApi = {
  list: () => http.get<Category[]>('/categories'),
  create: (data: CategoryInput) => http.post<Category>('/categories', data),
  update: (id: string, data: Partial<CategoryInput>) => http.put<Category>(`/categories/${id}`, data),
  remove: (id: string) => http.delete(`/categories/${id}`),
};
