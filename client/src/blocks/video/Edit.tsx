import { useTranslation } from 'react-i18next';
import Input from '../../components/ui/Input.tsx';
import MediaInput from '../../features/media/MediaInput.tsx';
import type { BlockEditProps } from '../types.ts';

export default function VideoEdit({ props, onChange }: BlockEditProps<'video'>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <MediaInput kind="video" value={props.src} onChange={(src) => onChange({ ...props, src })} />
      {props.src && (
        <Input
          value={props.caption}
          onChange={(e) => onChange({ ...props, caption: e.target.value })}
          placeholder={t('blocks.video.caption')}
        />
      )}
    </div>
  );
}
