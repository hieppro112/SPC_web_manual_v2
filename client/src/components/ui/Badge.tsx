// Badge — nhãn nhỏ (trạng thái, thể loại...).
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.ts';

type Tone = 'neutral' | 'accent' | 'warning';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent',
  warning: 'bg-warning-soft text-warning',
};

export default function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}
