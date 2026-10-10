import { useTranslation } from 'react-i18next';
import Markdown from '../../components/Markdown.tsx';
import { cn } from '../../lib/utils.ts';
import type { BlockViewProps } from '../types.ts';
import { CALLOUT_STYLES } from './styles.ts';

export default function CalloutView({ props }: BlockViewProps<'callout'>) {
  const { t } = useTranslation();
  if (!props.text.trim()) return null;
  const { icon: Icon, box, text } = CALLOUT_STYLES[props.variant] ?? CALLOUT_STYLES.info;

  return (
    // role="note": trình đọc màn hình hiểu đây là một ghi chú tách khỏi mạch văn.
    <div role="note" className={cn('avoid-break my-4 flex gap-3 rounded-r-xl border-l-4 px-4 py-3', box)}>
      <Icon className={cn('mt-1 h-5 w-5 shrink-0', text)} aria-label={t(`blocks.callout.${props.variant}`)} />
      <Markdown text={props.text} className="prose-p:my-1" />
    </div>
  );
}
