import type { BlockEditProps } from '../types.ts';

// Đường kẻ không có gì để chỉnh, chỉ hiện xem trước.
export default function DividerEdit(_props: BlockEditProps<'divider'>) {
  return <hr className="my-3 border-border" />;
}
