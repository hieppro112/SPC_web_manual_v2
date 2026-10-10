// ============================================================
// theme/useTheme.ts — Sáng / Tối / Theo hệ thống
// ============================================================
// Theme là trạng thái DÙNG CHUNG (nút đổi theme, thông báo toast... cùng
// cần biết). Thay vì Context, ở đây dùng một "store" nhỏ nằm ngoài React
// + useSyncExternalStore để component nào cần thì đăng ký nghe.
// 🔸 Flutter: giống một ValueNotifier toàn cục + ValueListenableBuilder.

import { useSyncExternalStore } from 'react';
import { storage } from '../lib/utils.ts';

export type ThemeChoice = 'light' | 'dark' | 'system';

const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

const saved = storage.get('theme');
let choice: ThemeChoice = saved === 'light' || saved === 'dark' ? saved : 'system';

function resolve(): 'light' | 'dark' {
  return choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
}

// Gắn/bỏ class "dark" trên <html>; index.css đổi toàn bộ màu theo class này.
function apply() {
  document.documentElement.classList.toggle('dark', resolve() === 'dark');
  listeners.forEach((listener) => listener());
}

// Người dùng chọn "theo hệ thống" rồi đổi chế độ tối của Windows -> đổi theo ngay.
media.addEventListener('change', () => {
  if (choice === 'system') apply();
});

export function setTheme(next: ThemeChoice) {
  choice = next;
  storage.set('theme', next);
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  // Snapshot là một chuỗi: đổi lựa chọn hoặc đổi chế độ hệ thống đều làm
  // chuỗi khác đi -> component vẽ lại.
  useSyncExternalStore(subscribe, () => `${choice}:${resolve()}`);
  return { choice, resolved: resolve(), setTheme };
}
