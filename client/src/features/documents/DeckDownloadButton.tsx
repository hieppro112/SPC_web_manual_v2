// ============================================================
// DeckDownloadButton — nút "PowerPoint": tải bài viết dạng slide
// ============================================================
// Mở menu -> hỏi server các ngôn ngữ có file (bản gốc + bản đã dịch) -> mỗi
// ngôn ngữ một link tải. File được server tạo sẵn khi xuất bản / có bản dịch;
// chưa có thì bấm tải là server tạo ngay (vài giây).
// Bài dài (> 50 slide) vẫn tải được, chỉ hiện dòng nhắc trước.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Presentation } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Popover from '../../components/ui/Popover.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { errorMessage } from '../../lib/utils.ts';
import { documentsApi } from './api.ts';
import { useDeckInfo } from './queries.ts';

const LONG_DECK = 50;

export default function DeckDownloadButton({ docId }: { docId: string }) {
  const { t } = useTranslation();
  // Chỉ gọi API sau khi mở menu lần đầu (không làm chậm lúc mở trang đọc).
  const [opened, setOpened] = useState(false);
  const info = useDeckInfo(docId, opened);

  return (
    <Popover
      trigger={(toggle) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOpened(true);
            toggle();
          }}
        >
          <Presentation className="h-4 w-4" /> PowerPoint
        </Button>
      )}
    >
      {(close) => (
        <div className="w-72">
          <p className="px-2.5 pt-1 pb-2 text-xs text-muted">{t('doc.deckHint')}</p>
          {info.isPending && <Spinner className="py-4" />}
          {info.error && <p className="px-2.5 py-2 text-sm text-danger">{errorMessage(info.error)}</p>}
          {info.data?.items.map((item) => (
            // Thẻ <a download>: trình duyệt tự tải file, cookie đăng nhập gửi kèm như mọi link.
            <a
              key={item.lang}
              href={documentsApi.deckUrl(docId, item.lang)}
              download
              onClick={close}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
            >
              <Presentation className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{t(`quiz.languages.${item.lang}`)}</span>
                {item.lang === info.data.sourceLang && <span className="ml-1 text-xs text-muted">({t('translation.original')})</span>}
                <span className="block text-xs text-muted">
                  {item.slides !== null ? t('doc.deckSlides', { n: item.slides }) : t('doc.deckNotReady')}
                </span>
                {item.slides !== null && item.slides > LONG_DECK && (
                  <span className="block text-xs text-warning">{t('doc.deckLong', { n: item.slides })}</span>
                )}
              </span>
            </a>
          ))}
        </div>
      )}
    </Popover>
  );
}
