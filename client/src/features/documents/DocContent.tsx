// ============================================================
// DocContent — vẽ toàn bộ khối của một tài liệu ở chế độ đọc
// ============================================================
// Dùng chung cho: trang đọc, trang lịch sử (xem bản cũ), chế độ "Xem trước"
// của trình soạn. Nhận `meta` đã tính sẵn (số bước, anchor) từ cha.

import { useTranslation } from 'react-i18next';
import BlockView from '../../blocks/BlockView.tsx';
import type { Block, BlockMeta } from '../../blocks/types.ts';

type Props = { blocks: Block[]; meta: Map<string, BlockMeta> };

export default function DocContent({ blocks, meta }: Props) {
  const { t } = useTranslation();
  if (!blocks.length) return <p className="py-10 text-center text-muted italic">{t('doc.noContent')}</p>;

  return (
    <div className="leading-relaxed">
      {blocks.map((block) => (
        // key = id khối (không dùng index): kéo đổi vị trí khối thì React
        // vẫn nhận ra khối nào là khối nào. 🔸 Flutter: như ValueKey.
        <BlockView key={block.id} block={block} meta={meta.get(block.id) ?? {}} />
      ))}
    </div>
  );
}
