// ============================================================
// ReadingTracker — đồng hồ đọc tài liệu (góc trái dưới trang đọc)
// ============================================================
// Chỉ hiện với người bị đếm giờ (quyền "Người dùng" + bài có thời gian đọc tối thiểu).
//
//   Đồng hồ CHẠY khi: tab đang mở trước mắt VÀ vừa cuộn trang trong 20 giây gần nhất
//                     (bài ngắn không có gì để cuộn: chỉ cần tab đang mở)
//   Đồng hồ ĐỨNG khi: 20 giây không cuộn, hoặc chuyển sang tab / cửa sổ khác
//   Đọc xong khi:     đủ thời gian + đã cuộn tới cuối bài
//
// Cứ 15 giây gửi server số giây vừa đọc ("nhịp"). Server mới là nơi cộng giờ và
// chỉ cộng tối đa bằng thời gian thật -> sửa đồng hồ ở trình duyệt cũng vô ích.
// Đọc xong -> đồng hồ thành nút "Làm bài kiểm tra".
// 🔸 Flutter: giống Timer.periodic + ScrollController listener + WidgetsBindingObserver (app paused).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Pause, Timer } from 'lucide-react';
import { cn } from '../../lib/utils.ts';
import { READING_END_ID, mmss, readingApi, type ReadingProgress, type ReadingStatus } from './api.ts';

const IDLE_MS = 20_000; // 20 giây không cuộn -> đứng
const BEAT_MS = 15_000; // 15 giây gửi server một lần

type Props = { docId: string; status: ReadingStatus };

export default function ReadingTracker({ docId, status }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const required = status.requiredSeconds ?? 0;
  const serverDone = !!status.progress?.completedAt;

  // Lazy init: chỉ lấy giá trị server LÚC MỞ (DocPage gắn key theo bài + phiên bản).
  const [seconds, setSeconds] = useState(() => status.progress?.seconds ?? 0);
  const [reachedEnd, setReachedEnd] = useState(() => !!status.progress?.reachedEnd);
  const [paused, setPaused] = useState(false);

  const pending = useRef(0); // số giây đã đếm mà chưa gửi server
  const sentEnd = useRef(!!status.progress?.reachedEnd);
  const lastScroll = useRef(0); // lúc cuộn gần nhất (gán khi mở bài -> 20 giây "ân hạn" trước khi cần cuộn)
  const latest = useRef({ reachedEnd, seconds });
  useEffect(() => {
    latest.current = { reachedEnd, seconds };
  });

  const applyProgress = useCallback(
    (progress: ReadingProgress) => {
      // Server là chuẩn: giây đã ghi nhận + phần chưa kịp gửi.
      setSeconds(progress.seconds + pending.current);
      queryClient.setQueryData<ReadingStatus>(['reading', docId], (old) => (old ? { ...old, progress } : old));
    },
    [docId, queryClient],
  );

  // Gửi một nhịp. keepalive: vẫn gửi được khi đang đóng tab / chuyển trang.
  const flush = useCallback(
    (keepalive = false) => {
      const delta = Math.min(pending.current, 60);
      const end = latest.current.reachedEnd;
      if (delta === 0 && end === sentEnd.current) return;
      pending.current -= delta;
      sentEnd.current = end;
      const body = { version: status.version, delta, reachedEnd: end };
      if (keepalive) {
        void fetch(`/api/reading/${docId}/beat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
          credentials: 'same-origin',
        }).catch(() => {});
        return;
      }
      readingApi
        .beat(docId, body)
        .then((res) => res.progress && applyProgress(res.progress))
        // 409 = bài vừa có phiên bản mới -> tải lại bài + đồng hồ (đếm lại từ đầu).
        .catch(() => {
          void queryClient.invalidateQueries({ queryKey: ['reading', docId] });
          void queryClient.invalidateQueries({ queryKey: ['documents', 'slug'] });
        });
    },
    [docId, status.version, applyProgress, queryClient],
  );

  // Nhịp đầu (0 giây): tạo dòng tiến độ + mốc thời gian để server tính giới hạn cộng giờ.
  useEffect(() => {
    if (serverDone) return;
    readingApi
      .beat(docId, { version: status.version, delta: 0, reachedEnd: false })
      .then((res) => res.progress && applyProgress(res.progress))
      .catch(() => {});
  }, [docId, status.version, serverDone, applyProgress]);

  // Cuộn trang / quay lại tab = đang đọc.
  useEffect(() => {
    lastScroll.current = Date.now();
    const onScroll = () => (lastScroll.current = Date.now());
    const onVisibility = () => {
      if (document.visibilityState === 'visible') lastScroll.current = Date.now();
      else flush(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  // Thấy phần tử cuối bài = đã cuộn tới cuối (bài ngắn: thấy ngay).
  useEffect(() => {
    const end = document.getElementById(READING_END_ID);
    if (!end || reachedEnd) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setReachedEnd(true);
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [reachedEnd]);

  // Đồng hồ: mỗi giây xét có đang đọc không.
  useEffect(() => {
    if (serverDone) return;
    const timer = setInterval(() => {
      const visible = document.visibilityState === 'visible';
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 40;
      const active = visible && (!scrollable || Date.now() - lastScroll.current < IDLE_MS);
      setPaused(!active);
      if (active && latest.current.seconds < required) {
        pending.current += 1;
        setSeconds((s) => s + 1);
      }
    }, 1000);
    const beat = setInterval(() => flush(), BEAT_MS);
    return () => {
      clearInterval(timer);
      clearInterval(beat);
      flush(true); // rời trang: gửi nốt phần chưa gửi
    };
  }, [serverDone, required, flush]);

  // Vừa đủ điều kiện ở trình duyệt -> gửi ngay để server xác nhận "đã đọc xong".
  const localDone = seconds >= required && reachedEnd;
  useEffect(() => {
    if (localDone && !serverDone) flush();
  }, [localDone, serverDone, flush]);

  if (serverDone) {
    return (
      <Link
        to={`/quizzes?doc=${docId}`}
        className="no-print fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-6rem)] items-center gap-2 rounded-full bg-success px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:opacity-90"
      >
        <CircleCheck className="h-4 w-4 shrink-0" />
        <span className="truncate">{t('reading.doneGoQuiz')}</span>
      </Link>
    );
  }

  const percent = Math.min(100, (seconds / Math.max(1, required)) * 100);
  const timeOk = seconds >= required;
  return (
    <div
      role="status"
      className={cn(
        'no-print fixed bottom-4 left-4 z-40 w-72 max-w-[calc(100vw-6rem)] rounded-2xl border bg-bg px-3 py-2 shadow-lg',
        paused && !timeOk ? 'border-warning/60' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        {paused && !timeOk ? <Pause className="h-4 w-4 text-warning" /> : <Timer className="h-4 w-4 text-accent" />}
        <span className="font-medium tabular-nums">
          {mmss(Math.min(seconds, required))} / {mmss(required)}
        </span>
        <span className="ml-auto text-xs text-muted">{t('reading.title')}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full transition-all', timeOk ? 'bg-success' : 'bg-accent')} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {timeOk ? (reachedEnd ? t('reading.saving') : t('reading.scrollToEnd')) : paused ? t('reading.paused') : t('reading.running')}
      </p>
    </div>
  );
}
