// ============================================================
// i18n/index.ts — Khởi tạo đa ngôn ngữ (chỉ giao diện)
// ============================================================
// Component dùng:  const { t } = useTranslation();  t('nav.login')
// Nội dung TÀI LIỆU không dịch — viết bằng ngôn ngữ nào hiện nguyên như vậy.
// 🔸 Flutter: giống flutter_localizations + file .arb, t('key') ≈ AppLocalizations.of(context).key

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { storage } from '../lib/utils.ts';
import { en } from './en.ts';
import { ja } from './ja.ts';
import { vi } from './vi.ts';

export const LANGUAGES = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
] as const;

const saved = storage.get('lang');
const initial = LANGUAGES.some((l) => l.code === saved) ? saved! : 'vi';

i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en }, ja: { translation: ja } },
  lng: initial,
  fallbackLng: 'vi',
  // React đã tự chống chèn HTML khi hiển thị chữ, không cần i18next làm lần nữa.
  interpolation: { escapeValue: false },
});

// Đổi ngôn ngữ thì nhớ lại + đổi thuộc tính lang của <html> (trình duyệt
// dùng để chọn font, đọc màn hình...).
document.documentElement.lang = initial;
i18n.on('languageChanged', (lng) => {
  storage.set('lang', lng);
  document.documentElement.lang = lng;
});

export default i18n;
