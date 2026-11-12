// ============================================================
// ReadingProgress — vạch mỏng ngay dưới thanh trên cùng, chạy theo % bài đã đọc
// ============================================================
// Cuộn trang bắn sự kiện "scroll" hàng chục lần mỗi giây. Nếu mỗi lần đều
// setState thì React vẽ lại component chừng ấy lần -> giật. Ở đây:
//   - requestAnimationFrame: gộp nhiều lần cuộn thành tối đa 1 lần tính / khung hình
//   - ghi thẳng style.transform vào thẻ qua ref, KHÔNG qua state -> không vẽ lại gì cả
// 🔸 Flutter: giống dùng ScrollController.addListener + AnimatedBuilder chỉ vẽ lại
//    đúng cái vạch, thay vì setState cả màn hình.

import { useEffect, useRef } from 'react';

export default function ReadingProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      // Quãng cuộn được = chiều cao bài - chiều cao màn hình. Bài ngắn hơn màn hình -> coi như 100%.
      const total = rect.height - window.innerHeight;
      const ratio = total <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / total));
      if (barRef.current) barRef.current.style.transform = `scaleX(${ratio})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Ảnh tải xong làm bài dài ra (không có sự kiện scroll) -> theo dõi kích thước bài.
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, [targetId]);

  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-x-0 top-14 z-40 h-[3px]">
      <div ref={barRef} className="h-full origin-left bg-accent transition-transform duration-75" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}
