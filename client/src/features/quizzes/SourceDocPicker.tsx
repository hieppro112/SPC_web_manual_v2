// ============================================================
// SourceDocPicker — chọn tài liệu nguồn cho đề (trang /quizzes/new)
// ============================================================
//   1. "Chủ đề chính": bài đang xem khi bấm "Tạo bài kiểm tra" -> CỐ ĐỊNH (locked).
//      Mở trang từ nút "Tạo bài kiểm tra" chung (không có bài) -> chọn bài chính trước.
//   2. "Thêm bài khác": danh sách có ô tìm, tick để gộp thêm bài vào đề.
//   Cạnh mỗi bài có nhãn "Đã có N đề" -> biết ngay bài nào từng được ra đề.
//
// Component này KHÔNG giữ state chọn bài — cha (QuizCreatePage) giữ và truyền xuống,
// vì cha còn cần danh sách đó để gửi Claude / tính đề trùng.
// 🔸 Flutter: giống widget Stateless nhận value + onChanged (kiểu Checkbox), state nằm ở cha.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Lock, Search, X } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Input from '../../components/ui/Input.tsx';
import type { DocSummary } from '../../lib/types.ts';
import { cn, removeDiacritics } from '../../lib/utils.ts';

export const MAX_DOCS = 10;

type Props = {
  docs: DocSummary[];
  mainId: string | null;
  mainLocked: boolean;
  extras: string[];
  quizCounts: Map<string, number>;
  disabled: boolean;
  onMainChange: (id: string | null) => void;
  onToggleExtra: (id: string) => void;
};

// Nhãn "Đã có N đề" (vàng) / "Chưa có đề" (xám) cạnh tên bài.
function CountBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return count > 0 ? <Badge tone="warning">{t('quiz.existing.countBadge', { count })}</Badge> : <Badge>{t('quiz.existing.noneBadge')}</Badge>;
}

export default function SourceDocPicker({ docs, mainId, mainLocked, extras, quizCounts, disabled, onMainChange, onToggleExtra }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const needle = removeDiacritics(filter.trim());
  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title ?? `#${id}`;
  const main = mainId ? docs.find((d) => d.id === mainId) : undefined;
  const full = extras.length + 1 >= MAX_DOCS;

  // Danh sách bên dưới: bỏ bài chính ra (đã nằm ở ô trên), lọc theo ô tìm.
  const shown = docs.filter((d) => d.id !== mainId && (!needle || removeDiacritics(d.title).includes(needle)));

  const searchBox = (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('quiz.searchDocs')} className="h-8 w-56 pl-8 text-sm" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ---------- 1. Chủ đề chính ---------- */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('quiz.existing.mainDoc')}</p>
        {mainId ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-accent/60 bg-accent-soft/40 px-3 py-2.5">
            <FileText className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{main?.title ?? titleOf(mainId)}</p>
              {main?.category && <p className="text-xs text-muted">{main.category.name}</p>}
            </div>
            <CountBadge count={quizCounts.get(mainId) ?? 0} />
            {mainLocked ? (
              // Mở từ một bài viết -> bài đó luôn là chủ đề chính, không đổi được.
              <span title={t('quiz.existing.mainLockedHint')} className="text-muted">
                <Lock className="h-4 w-4" />
              </span>
            ) : (
              <button type="button" onClick={() => onMainChange(null)} disabled={disabled} className="text-sm text-accent hover:underline">
                {t('quiz.existing.changeMain')}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('quiz.existing.pickMain')}</p>
        )}
      </div>

      {/* ---------- 2. Thêm bài khác (hoặc chọn bài chính nếu chưa có) ---------- */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {mainId ? t('quiz.existing.addMore') : t('quiz.existing.pickMainList')}
            {mainId && <span className="font-normal text-muted"> · {t('quiz.existing.addMoreHint', { max: MAX_DOCS - 1 })}</span>}
          </span>
          {searchBox}
        </div>

        {extras.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {extras.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                {titleOf(id)}
                <button type="button" onClick={() => onToggleExtra(id)} disabled={disabled} aria-label={t('common.delete')}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg">
          {shown.map((d) => {
            const checked = extras.includes(d.id);
            const row = (
              <>
                <span className="min-w-0 flex-1">
                  {d.title}
                  {d.category && <span className="ml-2 text-xs text-muted">{d.category.name}</span>}
                </span>
                <CountBadge count={quizCounts.get(d.id) ?? 0} />
              </>
            );
            const rowClass = 'flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-2';
            // Chưa có bài chính: bấm một dòng = chọn bài đó làm chủ đề chính.
            if (!mainId) {
              return (
                <button key={d.id} type="button" className={rowClass} onClick={() => onMainChange(d.id)} disabled={disabled}>
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  {row}
                </button>
              );
            }
            return (
              <label key={d.id} className={cn(rowClass, 'cursor-pointer', !checked && full && 'cursor-not-allowed opacity-50')}>
                <input type="checkbox" checked={checked} onChange={() => onToggleExtra(d.id)} disabled={disabled || (!checked && full)} />
                {row}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
