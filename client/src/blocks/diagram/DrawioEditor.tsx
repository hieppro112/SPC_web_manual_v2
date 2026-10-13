// ============================================================
// DrawioEditor — mở draw.io toàn màn hình để vẽ / sửa sơ đồ
// ============================================================
// draw.io chạy trong <iframe> (trang /drawio do server tự host) và nói
// chuyện với app qua window.postMessage — "chế độ nhúng" của draw.io:
//
//   draw.io ──{event:'init'}──────────▶ app   "tôi sẵn sàng"
//   draw.io ◀─{action:'load', xml}──── app   mở sơ đồ cũ (xml rỗng = trang trắng)
//   draw.io ──{event:'save', xml}─────▶ app   người dùng bấm Lưu
//   draw.io ◀─{action:'export'}──────── app   "xuất ảnh SVG giúp tôi"
//   draw.io ──{event:'export', data}──▶ app   -> upload SVG, cập nhật khối
//   draw.io ──{event:'exit'}──────────▶ app   người dùng bấm Thoát
//
// 🔸 Flutter: giống WebView + JavascriptChannel — hai bên chỉ trao đổi tin nhắn,
// không gọi thẳng hàm của nhau.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Spinner from '../../components/ui/Spinner.tsx';
import { mediaApi } from '../../features/media/api.ts';
import { errorMessage } from '../../lib/utils.ts';

type Props = {
  xml: string;
  onSave: (result: { xml: string; src: string }) => void;
  onClose: () => void;
};

type DrawioMessage = { event?: string; xml?: string; data?: string; exit?: boolean };

// Các tham số của chế độ nhúng (xem tài liệu "embed mode" của draw.io).
function buildUrl(lang: string, dark: boolean): string {
  const params = new URLSearchParams({
    embed: '1', // chế độ nhúng
    proto: 'json', // tin nhắn dạng JSON
    spin: '1', // hiện vòng quay khi đang tải
    stealth: '1', // tắt mọi tính năng cần gọi ra internet
    saveAndExit: '1', // nút "Lưu & thoát"
    noSaveBtn: '1', // ẩn nút "Lưu" (chỉ giữ "Lưu & thoát" cho đơn giản)
    modified: 'unsavedChanges', // hiện chữ "chưa lưu" khi có thay đổi
    libraries: '1', // cho mở thêm thư viện hình
    lang,
    dark: dark ? '1' : '0',
  });
  return `/drawio/index.html?${params}`;
}

export default function DrawioEditor({ xml, onSave, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // URL tính MỘT lần lúc mở: đổi ngôn ngữ giữa chừng không làm tải lại draw.io.
  const [src] = useState(() => buildUrl(i18n.language, document.documentElement.classList.contains('dark')));

  // Giữ props mới nhất trong ref: listener bên dưới chỉ gắn MỘT lần nhưng
  // luôn gọi đúng hàm mới nhất.
  const latest = useRef({ xml, onSave, onClose, t });
  useEffect(() => {
    latest.current = { xml, onSave, onClose, t };
  });

  // Khóa cuộn trang phía sau khi đang vẽ.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    // XML của lần bấm Lưu đang chờ draw.io xuất ảnh xong.
    let pending: { xml: string; exit: boolean } | null = null;

    const post = (msg: object) => frameRef.current?.contentWindow?.postMessage(JSON.stringify(msg), window.location.origin);

    const onMessage = async (e: MessageEvent) => {
      // Chỉ nghe tin nhắn từ ĐÚNG iframe draw.io của mình.
      if (e.source !== frameRef.current?.contentWindow || typeof e.data !== 'string') return;
      let msg: DrawioMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.event === 'init') {
        post({ action: 'load', xml: latest.current.xml, autosave: 0 });
        setReady(true);
      } else if (msg.event === 'save') {
        pending = { xml: msg.xml ?? '', exit: !!msg.exit };
        post({
          action: 'export',
          format: 'svg',
          asText: true, // trả về chuỗi SVG, không phải data URI
          theme: 'light', // luôn xuất màu sáng (ảnh hiện trên nền trắng)
          background: '#ffffff',
          spinKey: 'saving',
        });
      } else if (msg.event === 'export' && pending) {
        const { xml: savedXml, exit } = pending;
        pending = null;
        try {
          const { url } = await mediaApi.uploadDiagram(msg.data ?? '');
          latest.current.onSave({ xml: savedXml, src: url });
          if (exit) latest.current.onClose();
          else post({ action: 'status', message: latest.current.t('blocks.diagram.saved'), modified: false });
        } catch (err) {
          toast.error(errorMessage(err));
        }
      } else if (msg.event === 'exit') {
        latest.current.onClose();
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // createPortal: vẽ thẳng vào <body>, thoát khỏi khung khối đang soạn
  // (khung đó có transform của kéo-thả, làm `fixed` bị lệch).
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-bg">
      <iframe ref={frameRef} src={src} title={t('blocks.diagram.label')} className="h-full w-full border-0" />
      {!ready && <Spinner className="absolute inset-0 bg-bg" />}
    </div>,
    document.body,
  );
}
