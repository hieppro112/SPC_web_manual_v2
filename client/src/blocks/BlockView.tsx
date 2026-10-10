// ============================================================
// BlockView — vẽ MỘT khối ở chế độ đọc, tra registry để chọn component
// ============================================================
// Đây là chỗ thay cho chuỗi `{type === 'heading' && ...}` của bản cũ.
// Khối không có trong registry (dữ liệu lạ) thì hiện ô báo, không làm sập trang.

import { useTranslation } from 'react-i18next';
import { getDefinition } from './registry.ts';
import type { Block, BlockMeta, BlockPropsMap, BlockType } from './types.ts';

export default function BlockView({ block, meta }: { block: Block; meta: BlockMeta }) {
  const { t } = useTranslation();
  const def = getDefinition(block.type);

  if (!def) {
    return (
      <p className="no-print rounded-lg border border-dashed border-border p-3 text-sm text-muted">
        {t('blocks.unknown', { type: block.type })}
      </p>
    );
  }

  const View = def.View;
  return <View blockId={block.id} props={block.props as BlockPropsMap[BlockType]} meta={meta} />;
}
