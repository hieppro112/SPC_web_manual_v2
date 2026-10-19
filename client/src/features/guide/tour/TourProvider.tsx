// ============================================================
// TourProvider — tour dẫn đường + gợi ý "Chỉ cho tôi"
// ============================================================
// Tự viết (không thêm thư viện), gồm 3 lớp vẽ đè lên trang qua createPortal:
//   1. Lớp chặn bấm trong suốt phủ cả màn hình (chỉ khi chạy tour)
//   2. Khung sáng đặt đúng vị trí phần tử cần chỉ. Bóng đổ cực lớn
//      (box-shadow 0 0 0 9999px) làm tối mọi chỗ còn lại -> như "khoét lỗ".
//   3. Thẻ giải thích (tiêu đề, nội dung, nút Tiếp / Quay lại / Bỏ qua)
//
// Hai chế độ:
//   tour — đi lần lượt các bước trong tours.ts, không bấm được trang bên dưới
//   hint — một bước, chỉ khoanh viền (không làm tối, không chặn bấm) để người
//          dùng tự bấm vào chỗ được chỉ. Phần tử biến mất (đã sang trang khác)
//          hoặc nhiệm vụ xong -> gợi ý tự đóng.
//
// Vị trí phần tử đọc bằng getBoundingClientRect() mỗi khung hình
// (requestAnimationFrame) -> cuộn trang, đổi cỡ cửa sổ, menu mở ra... khung
// sáng vẫn bám đúng chỗ. 🔸 Flutter: giống dùng GlobalKey + RenderBox.localToGlobal
// rồi vẽ một OverlayEntry.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Button from '../../../components/ui/Button.tsx';
import { cn, storage } from '../../../lib/utils.ts';
import { useCurrentUser } from '../../auth/queries.ts';
import { useCompleteTask, useGuideProgress } from '../queries.ts';
import { TourContext, type Hint, type TourApi } from './context.ts';
import { TOURS, type TourId } from './tours.ts';

// run: số lần chạy, tăng mỗi lần bắt đầu tour / gợi ý -> lần chạy lại không dùng nhầm kết quả của lần trước.
type Session = { kind: 'tour'; tour: TourId; index: number; dir: 1 | -1; run: number } | { kind: 'hint'; hint: Hint; run: number };
type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6; // khung sáng rộng hơn phần tử một chút
const WAIT_AFTER_NAV_MS = 4000; // vừa chuyển trang: đợi trang (tải lười như trình soạn) vẽ xong
const WAIT_MS = 600; // trang đã sẵn: không thấy phần tử là do khác quyền / cỡ màn hình -> bỏ qua nhanh
const seenKey = (userId: string) => `guide.tourSeen.${userId}`;

// Phần tử data-tour="name" đầu tiên đang HIỆN trên màn hình. Cùng một tên có
// thể có 2 chỗ (ô tìm kiếm trên header cho máy tính + trong trang cho điện thoại).
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function TourProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useCurrentUser();
  const progress = useGuideProgress();
  const complete = useCompleteTask();

  const [rawSession, setSession] = useState<Session | null>(null);
  // Phần tử tìm được cho bước nào (key = stepKey). Lưu kèm key để biết kết quả
  // tìm là của bước HIỆN TẠI hay của bước cũ — khỏi phải "xóa" state mỗi khi đổi bước.
  const [found, setFound] = useState<{ key: string; el: HTMLElement | null } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const runSeq = useRef(0);
  const lastNavAt = useRef(0);

  // Gợi ý của một nhiệm vụ: nhiệm vụ vừa xong thì coi như gợi ý đã đóng.
  const hintTask = rawSession?.kind === 'hint' ? rawSession.hint.task : undefined;
  const session = hintTask && progress.data?.done[hintTask] ? null : rawSession;

  // Ref giữ giá trị mới nhất cho các hàm hẹn giờ / requestAnimationFrame
  // (chúng chạy "sau", không đọc được state mới nếu chỉ bắt lúc tạo).
  const sessionRef = useRef(session);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    sessionRef.current = session;
    pathnameRef.current = pathname;
  });

  const api = useMemo<TourApi>(
    () => ({
      startTour: (tour) => setSession({ kind: 'tour', tour, index: 0, dir: 1, run: ++runSeq.current }),
      showHint: (hint) => setSession({ kind: 'hint', hint, run: ++runSeq.current }),
    }),
    [],
  );

  const steps = session?.kind === 'tour' ? TOURS[session.tour].steps : [];
  const step = session?.kind === 'tour' ? steps[session.index] : undefined;
  const targetName = session?.kind === 'tour' ? step?.target : session?.hint.target;
  const route = session?.kind === 'tour' ? step?.route : session?.hint.route;
  // Mỗi bước / mỗi lần gợi ý có một "mã" riêng -> effect bên dưới chạy lại đúng một lần mỗi bước.
  const stepKey = !session ? null : session.kind === 'tour' ? `${session.run}:${session.index}` : `${session.run}:hint`;
  const target = found && found.key === stepKey ? found.el : null;
  const searching = !!targetName && found?.key !== stepKey;

  const markSeen = useCallback(() => {
    if (user) storage.set(seenKey(user.id), '1');
  }, [user]);

  const close = useCallback(() => {
    if (sessionRef.current?.kind === 'tour') markSeen();
    setSession(null);
  }, [markSeen]);

  const go = useCallback((delta: 1 | -1) => {
    setSession((s) => {
      if (s?.kind !== 'tour') return s;
      const next = s.index + delta;
      if (next < 0 || next >= TOURS[s.tour].steps.length) return s;
      return { ...s, index: next, dir: delta };
    });
  }, []);

  const finish = useCallback(() => {
    const s = sessionRef.current;
    if (s?.kind === 'tour') complete(TOURS[s.tour].task);
    markSeen();
    setSession(null);
  }, [complete, markSeen]);

  // ---------- Mỗi bước: mở đúng trang rồi đợi phần tử xuất hiện ----------
  useEffect(() => {
    if (!stepKey) return;
    if (route && pathnameRef.current !== route) {
      navigate(route);
      lastNavAt.current = Date.now();
    }
    if (!targetName) return;
    const deadline = Math.max(Date.now() + WAIT_MS, lastNavAt.current + WAIT_AFTER_NAV_MS);
    const timer = setInterval(() => {
      const el = findTarget(targetName);
      if (el) {
        clearInterval(timer);
        const r = el.getBoundingClientRect();
        // Khuất dưới header dính hoặc ngoài màn hình -> cuộn tới giữa.
        if (r.top < 64 || r.bottom > window.innerHeight - 16) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setFound({ key: stepKey, el });
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        setFound({ key: stepKey, el: null });
        // Tour: không có phần tử này (khác quyền, khác cỡ màn hình) -> bỏ qua bước.
        const s = sessionRef.current;
        if (s?.kind === 'tour') go(s.dir);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [stepKey, route, targetName, navigate, go]);

  // ---------- Bám theo vị trí phần tử mỗi khung hình ----------
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    let last = '';
    const tick = () => {
      if (!target.isConnected) {
        // Phần tử bị gỡ (người dùng đã sang trang khác): gợi ý thì đóng, tour thì hiện thẻ giữa màn hình.
        if (sessionRef.current?.kind === 'hint') setSession(null);
        setFound((f) => (f ? { ...f, el: null } : f));
        return;
      }
      const r = target.getBoundingClientRect();
      const key = `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (key !== last) {
        last = key;
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // ---------- Gợi ý: người dùng đã bấm đúng chỗ được chỉ -> gợi ý xong việc, tự đóng ----------
  const isHint = session?.kind === 'hint';
  useEffect(() => {
    if (!target || !isHint) return;
    const onClick = () => setSession(null);
    target.addEventListener('click', onClick);
    return () => target.removeEventListener('click', onClick);
  }, [target, isHint]);

  // ---------- Lần đầu đăng nhập: tự chạy tour giới thiệu ở trang chủ ----------
  const shouldAutoStart =
    !!user &&
    !session &&
    pathname === '/' &&
    !!progress.data?.tasks.some((task) => task.key === 'tour') &&
    !progress.data?.done.tour &&
    !storage.get(seenKey(user.id));
  useEffect(() => {
    if (!shouldAutoStart) return;
    // Đợi trang chủ vẽ xong danh sách rồi mới bắt đầu.
    const timer = setTimeout(() => api.startTour('main'), 1200);
    return () => clearTimeout(timer);
  }, [shouldAutoStart, api]);

  // ---------- Phím tắt ----------
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (session.kind !== 'tour') return;
      if (e.key === 'ArrowRight') {
        if (session.index === steps.length - 1) finish();
        else go(1);
      }
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, steps.length, close, finish, go]);

  return (
    <TourContext value={api}>
      {children}
      {session &&
        !searching &&
        createPortal(
          <TourLayer
            mode={session.kind}
            rect={target ? rect : null}
            title={session.kind === 'tour' ? t(`guide.steps.${step!.id}.title`) : session.hint.title}
            body={session.kind === 'tour' ? t(`guide.steps.${step!.id}.body`) : session.hint.body}
            index={session.kind === 'tour' ? session.index : 0}
            total={steps.length}
            onNext={() => (session.kind === 'tour' && session.index < steps.length - 1 ? go(1) : finish())}
            onBack={() => go(-1)}
            onClose={close}
          />,
          document.body,
        )}
    </TourContext>
  );
}

type LayerProps = {
  mode: 'tour' | 'hint';
  rect: Rect | null;
  title: string;
  body: string;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
};

function TourLayer({ mode, rect, title, body, index, total, onNext, onBack, onClose }: LayerProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const isTour = mode === 'tour';
  const last = index === total - 1;

  // Đo chiều cao thật của thẻ (đổi theo độ dài chữ) để đặt trên / dưới cho vừa.
  // ResizeObserver báo ngay lần đầu và mỗi khi thẻ đổi cỡ (sang bước chữ dài hơn).
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setCardHeight(card.offsetHeight));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  // Sang bước mới: đưa con trỏ bàn phím vào nút chính (Enter / Space để đi tiếp).
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [title]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw - 32);
  let top: number;
  let left: number;
  if (!rect) {
    top = (vh - cardHeight) / 2;
    left = (vw - width) / 2;
  } else {
    const below = rect.top + rect.height + PAD + 12;
    const above = rect.top - PAD - 12 - cardHeight;
    top = below + cardHeight <= vh - 8 ? below : above >= 8 ? above : vh - cardHeight - 16;
    left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 16), vw - width - 16);
  }

  return (
    <>
      {/* Lớp chặn bấm: đang chạy tour thì không bấm nhầm vào trang bên dưới. */}
      {isTour && <div className="fixed inset-0 z-[60]" aria-hidden onClick={(e) => e.stopPropagation()} />}

      {rect ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none fixed z-[60] rounded-xl transition-all duration-200 motion-reduce:transition-none',
            isTour ? 'ring-2 ring-accent' : 'animate-pulse ring-4 ring-accent',
          )}
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: isTour ? '0 0 0 9999px rgb(0 0 0 / 0.55)' : undefined,
          }}
        />
      ) : (
        isTour && <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] bg-black/55" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal={isTour}
        aria-labelledby="tour-title"
        className="fixed z-[61] rounded-2xl border border-border bg-bg p-4 shadow-2xl"
        style={{ top, left, width }}
      >
        <button
          type="button"
          onClick={onClose}
          title={isTour ? t('guide.skipTour') : t('common.close')}
          className="absolute top-2 right-2 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>

        {isTour && (
          <div className="mb-3 mr-6 h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
        )}
        <h2 id="tour-title" className="pr-6 font-semibold">
          {title}
        </h2>
        <p className="mt-1.5 text-sm whitespace-pre-line text-muted">{body}</p>

        <div className="mt-4 flex items-center gap-2">
          {isTour ? (
            <>
              <Button size="sm" variant="ghost" onClick={onClose} className="text-muted">
                {t('guide.skipTour')}
              </Button>
              <div className="ml-auto flex gap-2">
                {index > 0 && (
                  <Button size="sm" variant="secondary" onClick={onBack}>
                    {t('common.back')}
                  </Button>
                )}
                <Button size="sm" ref={nextRef} onClick={onNext}>
                  {last ? t('guide.finishTour') : t('guide.next')}
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" ref={nextRef} onClick={onClose} className="ml-auto">
              {t('guide.gotIt')}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
