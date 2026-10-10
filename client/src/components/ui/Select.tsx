// Select — ô chọn dùng chung. Nhận mọi prop của <select>.
// 🔸 Flutter: tương đương DropdownButton với value + onChanged.
import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils.ts';
import { fieldClass } from './Input.tsx';

export default function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, 'h-10 pr-8', className)} {...rest} />;
}
