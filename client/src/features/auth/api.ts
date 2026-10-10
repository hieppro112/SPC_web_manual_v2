// features/auth/api.ts — gọi API đăng nhập. Chỉ file api.ts được gọi http.
import { http } from '../../lib/http.ts';
import type { User } from '../../lib/types.ts';

export const authApi = {
  me: () => http.get<{ user: User | null }>('/auth/me').then((r) => r.user),
  setupStatus: () => http.get<{ needsSetup: boolean }>('/auth/setup-status'),
  setup: (data: { username: string; displayName: string; password: string }) =>
    http.post<{ user: User }>('/auth/setup', data).then((r) => r.user),
  login: (data: { username: string; password: string }) => http.post<{ user: User }>('/auth/login', data).then((r) => r.user),
  logout: () => http.post<void>('/auth/logout'),
  changePassword: (data: { currentPassword: string; newPassword: string }) => http.put<void>('/auth/password', data),
};
