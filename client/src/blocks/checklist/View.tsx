// ============================================================
// Checklist khi đọc — người đọc tự tick khi làm theo quy trình
// ============================================================
// Dấu tick chỉ lưu trong TRÌNH DUYỆT của người đó (localStorage), không
// gửi lên server: mỗi người làm quy trình có tiến độ của riêng mình, và
// khách không đăng nhập vẫn dùng được.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, storage } from '../../lib/utils.ts';
import type { BlockViewProps } from '../types.ts';

export default function ChecklistView({ props, blockId, meta }: BlockViewProps<'checklist'>) {
  const { t } = useTranslation();
  const items = props.items.filter((it) => it.text.trim());
  // Không có docId (vd đang xem trước trong trình soạn) thì không lưu.
  const storageKey = meta.docId ? `checklist:${meta.docId}:${blockId}` : null;

  // "Lazy initializer": hàm chỉ chạy MỘT lần lúc khối xuất hiện để đọc
  // localStorage, không đọc lại mỗi lần vẽ.
  const [checked, setChecked] = useState<string[]>(() => {
    if (!storageKey) return [];
    try {
      return JSON.parse(storage.get(storageKey) ?? '[]');
    } catch {
      return [];
    }
  });

  if (!items.length) return null;

  const save = (next: string[]) => {
    setChecked(next);
    if (storageKey) storage.set(storageKey, JSON.stringify(next));
  };
  const toggle = (id: string) => save(checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id]);
  const done = items.filter((it) => checked.includes(it.id)).length;

  return (
    <div className="avoid-break my-5 rounded-xl border border-border p-4">
      <div className="no-print mb-3 flex items-center justify-between text-xs text-muted">
        <span>{t('blocks.checklist.progress', { done, total: items.length })}</span>
        {done > 0 && (
          <button type="button" onClick={() => save([])} className="hover:text-fg">
            {t('blocks.checklist.reset')}
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const isChecked = checked.includes(item.id);
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(item.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--app-accent)]"
                />
                <span className={cn(isChecked && 'text-muted line-through')}>{item.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
