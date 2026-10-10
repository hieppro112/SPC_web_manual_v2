// Màu + icon cho 4 kiểu hộp lưu ý. Dùng chung cho Edit (nút chọn) và View.
import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { CalloutVariant } from '../types.ts';

export const CALLOUT_VARIANTS: CalloutVariant[] = ['info', 'success', 'warning', 'danger'];

export const CALLOUT_STYLES: Record<CalloutVariant, { icon: LucideIcon; box: string; text: string }> = {
  info: { icon: Info, box: 'border-info bg-info-soft', text: 'text-info' },
  success: { icon: CircleCheck, box: 'border-success bg-success-soft', text: 'text-success' },
  warning: { icon: TriangleAlert, box: 'border-warning bg-warning-soft', text: 'text-warning' },
  danger: { icon: OctagonAlert, box: 'border-danger bg-danger-soft', text: 'text-danger' },
};
