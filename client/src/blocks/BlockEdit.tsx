// BlockEdit — vẽ MỘT khối ở chế độ soạn, tra registry để chọn component.
// Cùng ý tưởng với BlockView nhưng dùng component Edit.
import { getDefinition } from './registry.ts';
import type { Block, BlockMeta, BlockPropsMap, BlockType } from './types.ts';

type Props = {
  block: Block;
  meta: BlockMeta;
  onChange: (props: BlockPropsMap[BlockType]) => void;
};

export default function BlockEdit({ block, meta, onChange }: Props) {
  const def = getDefinition(block.type);
  if (!def) return null;
  const Edit = def.Edit;
  return <Edit blockId={block.id} props={block.props as BlockPropsMap[BlockType]} meta={meta} onChange={onChange} />;
}
