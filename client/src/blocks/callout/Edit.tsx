import { useTranslation } from 'react-i18next';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import { cn } from '../../lib/utils.ts';
import type { BlockEditProps } from '../types.ts';
import { CALLOUT_STYLES, CALLOUT_VARIANTS } from './styles.ts';

export default function CalloutEdit({ props, onChange }: BlockEditProps<'callout'>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CALLOUT_VARIANTS.map((variant) => {
          const { icon: Icon, box, text } = CALLOUT_STYLES[variant];
          const active = props.variant === variant;
          return (
            <button
              key={variant}
              type="button"
              onClick={() => onChange({ ...props, variant })}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
                active ? cn(box, text) : 'border-border text-muted hover:bg-surface-2',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t(`blocks.callout.${variant}`)}
            </button>
          );
        })}
      </div>
      <AutoTextarea
        value={props.text}
        onChange={(e) => onChange({ ...props, text: e.target.value })}
        placeholder={t('blocks.callout.placeholder')}
      />
    </div>
  );
}
