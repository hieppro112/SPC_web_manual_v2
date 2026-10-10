// CategoryIcon — vẽ icon thể loại theo TÊN lưu trong DB ("Wrench" -> 🔧).
// createElement thay cho JSX <Icon/>: icon được tra từ bảng có sẵn (không
// phải component tạo mới mỗi lần vẽ), viết thế này cho rõ ý và linter hiểu.
import { createElement } from 'react';
import { categoryIcon } from './icons.ts';

export default function CategoryIcon({ name, className }: { name: string | undefined; className?: string }) {
  return createElement(categoryIcon(name), { className });
}
