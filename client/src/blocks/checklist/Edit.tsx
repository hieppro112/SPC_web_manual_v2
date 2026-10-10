import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Square, X } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import { newId } from '../../lib/utils.ts';
import type { BlockEditProps } from '../types.ts';

export default function ChecklistEdit({ props, onChange }: BlockEditProps<'checklist'>) {
  const { t } = useTranslation();
  // Nhớ mục vừa thêm để tự đặt con trỏ vào đó (gõ liên tục, Enter là sang mục mới).
  const [focusId, setFocusId] = useState<string | null>(null);

  const setItems = (items: typeof props.items) => onChange({ ...props, items });

  const addAfter = (index: number) => {
    const item = { id: newId(), text: '' };
    setItems([...props.items.slice(0, index + 1), item, ...props.items.slice(index + 1)]);
    setFocusId(item.id);
  };

  return (
    <div className="space-y-1.5">
      {props.items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2">
          <Square className="h-4 w-4 shrink-0 text-muted" />
          <Input
            value={item.text}
            autoFocus={item.id === focusId}
            onChange={(e) => setItems(props.items.map((it) => (it.id === item.id ? { ...it, text: e.target.value } : it)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAfter(i);
              }
            }}
            placeholder={t('blocks.checklist.placeholder')}
            className="h-8"
          />
          <button
            type="button"
            onClick={() => setItems(props.items.filter((it) => it.id !== item.id))}
            className="rounded p-1 text-muted hover:text-danger"
            title={t('common.remove')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => addAfter(props.items.length - 1)}>
        <Plus className="h-4 w-4" /> {t('blocks.checklist.addItem')}
      </Button>
    </div>
  );
}
