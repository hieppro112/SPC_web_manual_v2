// ============================================================
// Toc — mục lục tự sinh từ các khối tiêu đề + bước
// ============================================================
// Tô đậm mục đang đọc ("scrollspy") bằng IntersectionObserver: trình duyệt
// tự báo khi một tiêu đề đi vào/ra vùng nhìn thấy, không phải tự tính vị
// trí mỗi lần cuộn.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TocEntry } from '../../blocks/meta.ts';
import { cn } from '../../lib/utils.ts';

export default function Toc({ entries, onNavigate }: { entries: TocEntry[]; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const active = useActiveAnchor(entries);

  return (
    <nav aria-label={t('doc.toc')}>
      <ul className="space-y-0.5 border-l border-border text-sm">
        {entries.map((entry) => (
          <li key={entry.anchor}>
            <a
              href={`#${entry.anchor}`}
              onClick={onNavigate}
              className={cn(
                '-ml-px block border-l-2 py-1 pr-2 transition-colors',
                entry.depth === 2 ? 'pl-6' : 'pl-3',
                active === entry.anchor
                  ? 'border-accent font-medium text-accent'
                  : 'border-transparent text-muted hover:border-border hover:text-fg',
              )}
            >
              {entry.stepNumber !== undefined && <span className="mr-1 font-semibold">{entry.stepNumber}.</span>}
              {entry.label || t('blocks.step.number', { n: entry.stepNumber })}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function useActiveAnchor(entries: TocEntry[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = entries
      .map((e) => document.getElementById(e.anchor))
      .filter((el): el is HTMLElement => el !== null);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (records) => {
        // Trong các tiêu đề đang nằm ở nửa trên màn hình, chọn cái trên cùng.
        const visible = records.filter((r) => r.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Chỉ tính vùng từ dưới header (80px) tới giữa màn hình.
      { rootMargin: '-80px 0px -50% 0px' },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [entries]);

  return active;
}
