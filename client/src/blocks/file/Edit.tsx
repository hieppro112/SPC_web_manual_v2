import { useTranslation } from 'react-i18next';
import Input from '../../components/ui/Input.tsx';
import MediaInput from '../../features/media/MediaInput.tsx';
import type { BlockEditProps } from '../types.ts';

export default function FileEdit({ props, onChange }: BlockEditProps<'file'>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <MediaInput
        kind="file"
        value={props.src}
        // Upload/chọn từ thư viện thì biết sẵn tên + dung lượng; dán URL thì
        // lấy phần cuối của URL làm tên tạm.
        onChange={(src, media) =>
          onChange({
            src,
            name: media?.originalName || props.name || decodeURIComponent(src.split('/').pop() ?? ''),
            size: media?.size ?? 0,
          })
        }
      />
      {props.src && (
        <Input value={props.name} onChange={(e) => onChange({ ...props, name: e.target.value })} placeholder={t('blocks.file.name')} />
      )}
    </div>
  );
}
