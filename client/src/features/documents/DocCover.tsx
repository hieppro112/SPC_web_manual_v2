// DocCover — ảnh bìa của thẻ tài liệu. Lấp đầy khung cha (cha đặt kích thước + overflow-hidden).
//   Có ảnh     -> ảnh thu nhỏ, phóng nhẹ khi rê chuột vào thẻ (thẻ cha có class "group").
//   Sơ đồ SVG  -> vẽ trọn hình trên nền trắng (cắt mép thì mất chữ của sơ đồ).
//   Không ảnh / ảnh lỗi -> nền màu theo thể loại + icon thể loại cỡ lớn.
import { useState } from 'react';
import type { DocSummary } from '../../lib/types.ts';
import { cn } from '../../lib/utils.ts';
import CategoryIcon from '../categories/CategoryIcon.tsx';
import { coverTone, thumbUrl } from './cover.ts';

type Props = { doc: Pick<DocSummary, 'id' | 'category' | 'cover'>; iconClassName?: string };

export default function DocCover({ doc, iconClassName = 'h-12 w-12' }: Props) {
  // Nhớ ẢNH NÀO bị lỗi (không phải true/false): đổi sang bài khác thì tự thử ảnh mới.
  const [failed, setFailed] = useState<string | null>(null);
  const src = doc.cover && doc.cover !== failed ? doc.cover : null;

  if (src) {
    const isSvg = /\.svg(\?|$)/i.test(src);
    return (
      <img
        src={thumbUrl(src)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(src)}
        className={cn(
          'h-full w-full transition-transform duration-500 ease-out group-hover:scale-105',
          isSvg ? 'bg-white object-contain p-3' : 'object-cover',
        )}
      />
    );
  }
  return (
    <div className={cn('relative flex h-full w-full items-center justify-center overflow-hidden', coverTone(doc))}>
      {/* Icon mờ cỡ lớn chéo góc làm hoa văn nền, icon rõ ở giữa. */}
      <CategoryIcon name={doc.category?.iconName} className="absolute -right-6 -bottom-8 h-40 w-40 rotate-12 text-white/15" />
      <CategoryIcon
        name={doc.category?.iconName}
        className={cn('relative text-white/90 drop-shadow transition-transform duration-500 group-hover:scale-110', iconClassName)}
      />
    </div>
  );
}
