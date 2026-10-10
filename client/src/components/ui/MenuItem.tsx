// MenuItem — một dòng trong Popover/menu.
import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; selected?: boolean };

export default function MenuItem({ icon: Icon, selected, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2', className)}
      {...rest}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
      <span className="flex-1">{children}</span>
      {selected && <Check className="h-4 w-4 text-accent" />}
    </button>
  );
}
