import type { BlockViewProps } from '../types.ts';

export default function DividerView(_props: BlockViewProps<'divider'>) {
  return <hr className="my-8 border-border" />;
}
