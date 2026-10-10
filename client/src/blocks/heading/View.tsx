// Tiêu đề mục. Có `id` để mục lục / link chia sẻ nhảy tới đúng chỗ, và
// nút # (hiện khi rê chuột) để sao chép link tới mục này.
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link2 } from 'lucide-react';
import { copyText } from '../../lib/utils.ts';
import type { BlockViewProps } from '../types.ts';

export default function HeadingView({ props, meta }: BlockViewProps<'heading'>) {
  const { t } = useTranslation();
  if (!props.text.trim()) return null;

  const Tag = props.level === 3 ? 'h3' : 'h2';
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${meta.anchor}`;
    if (await copyText(url)) toast.success(t('common.copied'));
  };

  return (
    <Tag
      id={meta.anchor}
      className={
        props.level === 3
          ? 'group mt-8 mb-2 flex items-center gap-2 text-lg font-semibold'
          : 'group mt-10 mb-3 flex items-center gap-2 border-b border-border pb-2 text-2xl font-bold'
      }
    >
      {props.text}
      {meta.anchor && (
        <button
          type="button"
          onClick={copyLink}
          title={t('doc.copyLink')}
          className="no-print rounded p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent focus:opacity-100"
        >
          <Link2 className="h-4 w-4" />
        </button>
      )}
    </Tag>
  );
}
