// ============================================================
// services/translate/queue.ts — Đưa bài vào hàng đợi dịch
// ============================================================
// Lưu bài (tạo / sửa / khôi phục / nhập PowerPoint) -> requestTranslation().
// Không bao giờ làm hỏng việc lưu bài: lỗi hàng đợi chỉ ghi log.

import { config } from '../../config.ts';
import { enqueueTranslation, sweepTranslations, translationsReady } from '../../repositories/translations.ts';

// Bản hướng dẫn en/ja viết tay của phiên bản cũ (guide-en-..., guide-ja-...) không dịch nữa:
// nay chỉ giữ bản gốc tiếng Việt (guide-vi-...) và để máy dịch như mọi bài khác.
export const isLegacyGuideCopy = (slug: string) => /^guide-(en|ja)-/.test(slug);

export function requestTranslation(doc: { id: string | number; version: number; slug: string }): void {
  if (!config.translate.enabled || isLegacyGuideCopy(doc.slug)) return;
  void translationsReady()
    .then((ready) => (ready ? enqueueTranslation(Number(doc.id), doc.version, 1) : undefined))
    .catch((err: Error) => console.error('❌ Dịch: không đưa được bài vào hàng đợi:', err.message));
}

// Quét bài thiếu bản dịch lúc khởi động + định kỳ (lần đầu = dịch bù mọi bài cũ, worker làm dần).
export function startTranslationSweep(): void {
  if (!config.translate.enabled) return;
  const sweep = () =>
    translationsReady()
      .then(async (ready) => {
        if (!ready) return;
        const added = await sweepTranslations();
        if (added) console.log(`🌐 Dịch: thêm ${added} bài vào hàng đợi dịch`);
      })
      .catch((err: Error) => console.error('❌ Dịch: quét bài thiếu bản dịch lỗi:', err.message));
  void sweep();
  setInterval(() => void sweep(), config.translate.sweepHours * 60 * 60 * 1000).unref();
}
