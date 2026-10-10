import Markdown from '../../components/Markdown.tsx';
import type { BlockViewProps } from '../types.ts';

export default function ParagraphView({ props }: BlockViewProps<'paragraph'>) {
  if (!props.text.trim()) return null;
  return <Markdown text={props.text} />;
}
