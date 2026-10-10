import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import AutoTextarea from '../../components/ui/AutoTextarea.tsx';
import Select from '../../components/ui/Select.tsx';
import type { BlockEditProps } from '../types.ts';
import { CODE_LANGUAGES } from './languages.ts';

export default function CodeEdit({ props, onChange }: BlockEditProps<'code'>) {
  const { t } = useTranslation();

  // Phím Tab trong ô code: chèn 2 dấu cách thay vì nhảy sang ô khác.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    onChange({ ...props, code: `${props.code.slice(0, start)}  ${props.code.slice(end)}` });
    // Đặt lại con trỏ SAU khi React vẽ xong giá trị mới.
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
  };

  return (
    <div className="space-y-2">
      <Select
        aria-label={t('blocks.code.language')}
        value={props.language}
        onChange={(e) => onChange({ ...props, language: e.target.value })}
        className="h-8 w-48"
      >
        {CODE_LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label || t('blocks.code.plain')}
          </option>
        ))}
      </Select>
      <AutoTextarea
        value={props.code}
        onChange={(e) => onChange({ ...props, code: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder={t('blocks.code.placeholder')}
        spellCheck={false}
        minRows={4}
        className="bg-slate-950 font-mono text-[13px] text-slate-100"
      />
    </div>
  );
}
