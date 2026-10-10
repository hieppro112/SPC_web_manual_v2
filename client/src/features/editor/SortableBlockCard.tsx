// ============================================================
// SortableBlockCard — khung bao một khối trong trình soạn
// ============================================================
// Gồm: tay nắm kéo-thả, tên loại khối, nút lên/xuống/nhân bản/xóa,
// và phần soạn riêng của khối (BlockEdit) ở giữa.
//
// memo(): tài liệu dài hàng trăm khối, gõ vào MỘT khối không nên làm cả
// trăm khối kia vẽ lại. memo bỏ qua việc vẽ lại nếu props không đổi —
// vì vậy cha phải truyền callback ỔN ĐỊNH (useCallback) và giá trị đơn
// giản (stepNumber) thay vì object mới mỗi lần.
// 🔸 Flutter: giống const widget / tách widget con để build() không chạy lại.

import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Trash } from 'lucide-react';
import BlockEdit from '../../blocks/BlockEdit.tsx';
import { registry } from '../../blocks/registry.ts';
import type { Block, BlockPropsMap, BlockType } from '../../blocks/types.ts';
import Popover from '../../components/ui/Popover.tsx';
import { cn } from '../../lib/utils.ts';
import BlockPicker from './BlockPicker.tsx';

type Props = {
  block: Block;
  index: number;
  total: number;
  stepNumber?: number;
  onChange: (id: string, props: BlockPropsMap[BlockType]) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onInsertAfter: (index: number, type: BlockType) => void;
};

function SortableBlockCard({ block, index, total, stepNumber, onChange, onRemove, onDuplicate, onMove, onInsertAfter }: Props) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const Icon = registry[block.type]?.icon;

  const iconButton = 'rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30';

  return (
    <div
      ref={setNodeRef}
      // Translate (không Transform): chỉ dịch chuyển, không co giãn — các
      // khối cao thấp khác nhau sẽ không bị méo khi kéo ngang qua nhau.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('group relative', isDragging && 'z-10 opacity-80')}
    >
      <div className={cn('rounded-xl border bg-bg', isDragging ? 'border-accent shadow-xl' : 'border-border')}>
        <div className="flex items-center gap-1 border-b border-border px-2 py-1">
          {/* Chỉ tay nắm này mới kéo được — để bôi đen chữ trong ô nhập không bị hiểu là kéo khối. */}
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            title={t('editor.dragHint')}
            className="cursor-grab touch-none rounded-md p-1 text-muted hover:bg-surface-2 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          {Icon && <Icon className="h-3.5 w-3.5 text-muted" />}
          <span className="text-xs font-medium text-muted">
            {t(`blocks.${block.type}.label`)}
            {stepNumber !== undefined && ` ${stepNumber}`}
          </span>
          <div className="ml-auto flex items-center">
            <button type="button" className={iconButton} disabled={index === 0} onClick={() => onMove(block.id, -1)} title={t('common.moveUp')}>
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconButton}
              disabled={index === total - 1}
              onClick={() => onMove(block.id, 1)}
              title={t('common.moveDown')}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" className={iconButton} onClick={() => onDuplicate(block.id)} title={t('common.duplicate')}>
              <Copy className="h-4 w-4" />
            </button>
            <button type="button" className={cn(iconButton, 'hover:text-danger')} onClick={() => onRemove(block.id)} title={t('common.delete')}>
              <Trash className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="p-3">
          <BlockEdit block={block} meta={{ stepNumber }} onChange={(props) => onChange(block.id, props)} />
        </div>
      </div>

      {/* Nút "+" giữa hai khối: chèn khối mới ngay bên dưới khối này. */}
      <div className="flex h-6 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Popover
          trigger={(toggle) => (
            <button
              type="button"
              onClick={toggle}
              title={t('editor.insertHere')}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg text-muted hover:border-accent hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          align="center"
        >
          {(close) => (
            <BlockPicker
              layout="list"
              onPick={(type) => {
                onInsertAfter(index, type);
                close();
              }}
            />
          )}
        </Popover>
      </div>
    </div>
  );
}

export default memo(SortableBlockCard);
