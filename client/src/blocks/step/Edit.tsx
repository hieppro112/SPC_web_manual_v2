import { useTranslation } from 'react-i18next';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import Input from '../../components/ui/Input.tsx';
import MediaInput from '../../features/media/MediaInput.tsx';
import type { BlockEditProps } from '../types.ts';

export default function StepEdit({ props, onChange, meta }: BlockEditProps<'step'>) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3">
      {/* Số bước tự tính từ vị trí — kéo bước lên/xuống là số tự đổi. */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-fg">
        {meta.stepNumber}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Input
          value={props.title}
          onChange={(e) => onChange({ ...props, title: e.target.value })}
          placeholder={t('blocks.step.titlePlaceholder')}
          className="font-semibold"
        />
        <AutoTextarea
          value={props.text}
          onChange={(e) => onChange({ ...props, text: e.target.value })}
          placeholder={t('blocks.step.textPlaceholder')}
        />
        <p className="text-xs text-muted">{t('blocks.step.image')}</p>
        <MediaInput kind="image" value={props.image} onChange={(image) => onChange({ ...props, image })} />
      </div>
    </div>
  );
}
