// Danh sách icon cho thể loại. DB chỉ lưu TÊN icon ("Wrench"), client tra
// ra icon thật ở đây. Chỉ liệt kê một bộ chọn lọc — import cả thư viện
// lucide (~1900 icon) sẽ làm file JS rất nặng.
import {
  BookOpen,
  ClipboardList,
  Cpu,
  Database,
  Factory,
  Folder,
  Globe,
  HardHat,
  Laptop,
  Lock,
  Mail,
  Network,
  Package,
  Phone,
  Printer,
  Server,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Folder,
  BookOpen,
  Wrench,
  Factory,
  HardHat,
  ShieldCheck,
  Cpu,
  Laptop,
  Server,
  Network,
  Database,
  Printer,
  Zap,
  Package,
  Truck,
  ClipboardList,
  Settings,
  Globe,
  Lock,
  Mail,
  Phone,
  Users,
};

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Folder;
}
