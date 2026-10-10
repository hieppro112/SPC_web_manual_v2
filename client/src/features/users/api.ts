// features/users/api.ts
import { http } from '../../lib/http.ts';
import type { Role, User } from '../../lib/types.ts';

export type NewUser = { username: string; displayName: string; password: string; role: Role };
export type UserUpdate = { displayName?: string; role?: Role; password?: string };

export const usersApi = {
  list: () => http.get<User[]>('/users'),
  create: (data: NewUser) => http.post<User>('/users', data),
  update: (id: string, data: UserUpdate) => http.put<User>(`/users/${id}`, data),
  remove: (id: string) => http.delete(`/users/${id}`),
};
