// ============================================================
// Button — nút dùng chung cả app
// ============================================================
// Mọi nút đều đi qua component này, nên đổi kiểu nút một lần là cả app đổi.
//   <Button>Lưu</Button>                       nút chính (màu nhấn)
//   <Button variant="secondary">Hủy</Button>
//   <Button variant="ghost" size="icon"><X /></Button>
// Mọi prop của <button> thường (onClick, disabled, type...) đều dùng được.

import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger border border-danger/30 hover:bg-danger hover:text-white',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icon: 'h-9 w-9 justify-center',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export default function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: Props) {
  return (
    <button
      // Mặc định type="button": <button> trong <form> mặc định là "submit",
      // bấm nút phụ (vd "Thêm hàng") sẽ vô tình gửi form.
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg font-medium whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
