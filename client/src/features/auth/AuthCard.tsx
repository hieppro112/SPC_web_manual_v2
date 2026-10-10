// AuthCard — khung chung cho trang Đăng nhập và Đăng ký (logo + tiêu đề + nội dung).
import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';

type Props = { title: string; description?: string; children: ReactNode; footer?: ReactNode };

export default function AuthCard({ title, description, children, footer }: Props) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg">
              <BookOpen className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {children}
        </div>
        {footer && <p className="mt-4 text-center text-sm text-muted">{footer}</p>}
      </div>
    </div>
  );
}
