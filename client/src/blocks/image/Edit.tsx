import { useTranslation } from 'react-i18next';
import Input from '../../components/ui/Input.tsx';
import MediaInput from '../../features/media/MediaInput.tsx';
import type { BlockEditProps } from '../types.ts';

export default function ImageEdit({ props, onChange }: BlockEditProps<'image'>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <MediaInput kind="image" value={props.src} onChange={(src) => onChange({ ...props, src })} />
      {props.src && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={props.caption}
            onChange={(e) => onChange({ ...props, caption: e.target.value })}
            placeholder={t('blocks.image.caption')}
          />
          <Input value={props.alt} onChange={(e) => onChange({ ...props, alt: e.target.value })} placeholder={t('blocks.image.alt')} />
        </div>
      )}
    </div>
  );
}
