// EmptyState — khung "không có gì ở đây" / "lỗi" có icon, tiêu đề, mô tả, nút hành động.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Props = { icon: LucideIcon; title: string; description?: string; action?: ReactNode };

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <Icon className="mb-3 h-10 w-10 text-muted" strokeWidth={1.5} />
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
