// BlockPicker — danh sách loại khối để chọn, ĐỌC TỪ REGISTRY.
// Thêm loại khối mới vào registry là nó tự xuất hiện ở đây.
import { useTranslation } from 'react-i18next';
import { BLOCK_ORDER, registry } from '../../blocks/registry.ts';
import type { BlockType } from '../../blocks/types.ts';
import { cn } from '../../lib/utils.ts';

type Props = { onPick: (type: BlockType) => void; layout?: 'grid' | 'list' };

export default function BlockPicker({ onPick, layout = 'grid' }: Props) {
  const { t } = useTranslation();
  return (
    <div className={cn(layout === 'grid' ? 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3' : 'grid max-h-80 w-72 gap-0.5 overflow-y-auto')}>
      {BLOCK_ORDER.map((type) => {
        const Icon = registry[type].icon;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className={cn(
              'flex items-start gap-3 rounded-lg p-2.5 text-left hover:bg-surface-2',
              layout === 'grid' && 'border border-border bg-bg',
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t(`blocks.${type}.label`)}</span>
              <span className="block text-xs text-muted">{t(`blocks.${type}.desc`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
