// Cho TypeScript biết danh sách key hợp lệ: gõ t('nav.logn') (sai chính
// tả) là báo lỗi ngay, và gõ t(' là có gợi ý.
import 'i18next';
import type { vi } from './vi.ts';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof vi };
  }
}
