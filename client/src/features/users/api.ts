// features/users/api.ts
import { http } from '../../lib/http.ts';
import type { Role, User } from '../../lib/types.ts';

export type NewUser = { username: string; displayName: string; email?: string; password: string; role: Role };
export type UserUpdate = { displayName?: string; role?: Role; password?: string };

export const usersApi = {
  list: () => http.get<User[]>('/users'),
  create: (data: NewUser) => http.post<User>('/users', data),
  update: (id: string, data: UserUpdate) => http.put<User>(`/users/${id}`, data),
  approve: (id: string, role: Role) => http.post<User>(`/users/${id}/approve`, { role }),
  // Cũng dùng để TỪ CHỐI tài khoản chờ duyệt.
  remove: (id: string) => http.delete(`/users/${id}`),
};
