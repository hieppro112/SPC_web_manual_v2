// Input — ô nhập một dòng dùng chung. Nhận mọi prop của <input>.
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils.ts';

export const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60';

export default function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, 'h-10', className)} {...rest} />;
}
