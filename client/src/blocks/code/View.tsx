// Khối code: tô màu cú pháp (prism-react-renderer) + nút sao chép.
// Nền tối ở cả hai theme — quen mắt với người đọc code và in ra vẫn rõ.
import { Highlight, themes } from 'prism-react-renderer';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { copyText } from '../../lib/utils.ts';
import type { BlockViewProps } from '../types.ts';
import { CODE_LANGUAGES } from './languages.ts';

export default function CodeView({ props }: BlockViewProps<'code'>) {
  const { t } = useTranslation();
  if (!props.code.trim()) return null;

  const label = CODE_LANGUAGES.find((l) => l.value === props.language)?.label || props.language;

  const copy = async () => {
    if (await copyText(props.code)) toast.success(t('common.copied'));
  };

  return (
    <div className="avoid-break my-5 overflow-hidden rounded-xl border border-slate-800 bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-slate-400">
        <span>{label}</span>
        <button type="button" onClick={copy} className="no-print flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white">
          <Copy className="h-3.5 w-3.5" /> {t('common.copy')}
        </button>
      </div>
      <Highlight theme={themes.vsDark} code={props.code.replace(/\n$/, '')} language={props.language || 'text'}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre style={{ ...style, background: 'transparent' }} className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
