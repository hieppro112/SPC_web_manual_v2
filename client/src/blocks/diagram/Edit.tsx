import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PenTool, Workflow } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import { useServerMeta } from '../../features/media/queries.ts';
import type { BlockEditProps } from '../types.ts';
import DrawioEditor from './DrawioEditor.tsx';

export default function DiagramEdit({ props, onChange }: BlockEditProps<'diagram'>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Server chưa cài draw.io thì không mở được trình vẽ -> báo cách cài.
  const { data: meta } = useServerMeta();
  const canDraw = meta?.drawio === true;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canDraw}
        title={t('blocks.diagram.edit')}
        className="flex min-h-32 w-full items-center justify-center rounded-xl border border-dashed border-border p-3 text-muted transition hover:border-accent/50 hover:text-accent disabled:pointer-events-none"
      >
        {props.src ? (
          // Ảnh sơ đồ luôn nằm trên nền trắng (xuất với màu sáng), kể cả giao diện tối.
          <img src={props.src} alt={props.caption} className="max-h-80 w-auto max-w-full rounded-lg bg-white p-2" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm">
            <Workflow className="h-8 w-8" />
            {t('blocks.diagram.empty')}
          </span>
        )}
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={!canDraw}>
          <PenTool className="h-4 w-4" /> {props.src ? t('blocks.diagram.edit') : t('blocks.diagram.draw')}
        </Button>
        {props.src && (
          <Input
            value={props.caption}
            onChange={(e) => onChange({ ...props, caption: e.target.value })}
            placeholder={t('blocks.diagram.caption')}
            className="min-w-48 flex-1"
          />
        )}
      </div>
      {meta && !meta.drawio && <p className="text-xs text-warning">{t('blocks.diagram.notInstalled')}</p>}

      {open && (
        <DrawioEditor
          xml={props.xml}
          onSave={({ xml, src }) => onChange({ ...props, xml, src })}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
