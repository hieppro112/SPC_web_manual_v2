// ============================================================
// SearchBox — ô tìm kiếm (header + trang chủ trên điện thoại)
// ============================================================
// Từ khóa nằm trên URL (?q=...). Đang ở trang chủ: gõ tới đâu lọc tới đó
// (đợi 300ms sau phím cuối mới tìm — "debounce" — để không gọi API mỗi phím).
// Đang ở trang khác: gõ xong Enter thì về trang chủ kèm kết quả.

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { fieldClass } from './ui/Input.tsx';

export default function SearchBox({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const onHome = location.pathname === '/';
  const [value, setValue] = useState(urlQuery);

  // URL đổi từ nơi khác (bấm thể loại, nút Back) -> cập nhật ô nhập theo.
  // Đây là cách React khuyên: so với giá trị trước NGAY khi vẽ, thay vì
  // dùng useEffect (tránh vẽ thừa một lần).
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    if (!onHome || value.trim() === urlQuery) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      // replace: không tạo một mục lịch sử (nút Back) cho mỗi lần gõ.
      setParams(next, { replace: true });
    }, 300);
    // Gõ phím mới trước 300ms -> hủy hẹn giờ cũ.
    return () => clearTimeout(timer);
  }, [value, onHome, urlQuery, params, setParams]);

  return (
    <form
      role="search"
      data-tour="search"
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!onHome) navigate(value.trim() ? `/?q=${encodeURIComponent(value.trim())}` : '/');
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('common.searchPlaceholder')}
        aria-label={t('common.search')}
        className={cn(fieldClass, 'h-9 bg-surface pl-9')}
      />
    </form>
  );
}
