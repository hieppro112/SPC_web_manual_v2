// Spinner — vòng xoay "đang tải", có chữ đi kèm cho người dùng đọc màn hình.
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.ts';

export default function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-muted', className)}>
      <LoaderCircle className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label ?? t('common.loading')}</span>
    </div>
  );
}
