import { useTranslation } from 'react-i18next';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import type { BlockEditProps } from '../types.ts';

export default function ParagraphEdit({ props, onChange }: BlockEditProps<'paragraph'>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <AutoTextarea
        value={props.text}
        onChange={(e) => onChange({ ...props, text: e.target.value })}
        placeholder={t('blocks.paragraph.placeholder')}
        minRows={3}
      />
      <p className="font-mono text-[11px] text-muted">{t('blocks.paragraph.hint')}</p>
    </div>
  );
}
