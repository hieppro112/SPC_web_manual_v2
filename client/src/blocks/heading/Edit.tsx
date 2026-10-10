import { useTranslation } from 'react-i18next';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import { cn } from '../../lib/utils.ts';
import type { BlockEditProps } from '../types.ts';

export default function HeadingEdit({ props, onChange }: BlockEditProps<'heading'>) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <Select
        aria-label={t('blocks.heading.level')}
        value={props.level}
        onChange={(e) => onChange({ ...props, level: e.target.value === '3' ? 3 : 2 })}
        className="w-24 shrink-0"
      >
        <option value={2}>H2</option>
        <option value={3}>H3</option>
      </Select>
      <Input
        value={props.text}
        onChange={(e) => onChange({ ...props, text: e.target.value })}
        placeholder={t('blocks.heading.placeholder')}
        className={cn('font-semibold', props.level === 2 && 'text-lg')}
      />
    </div>
  );
}
