// Một bước trong quy trình: số thứ tự to, tên bước, mô tả, ảnh minh họa.
import { useTranslation } from 'react-i18next';
import Markdown from '../../components/Markdown.tsx';
import ZoomableImage from '../../components/ZoomableImage.tsx';
import type { BlockViewProps } from '../types.ts';

export default function StepView({ props, meta }: BlockViewProps<'step'>) {
  const { t } = useTranslation();
  const label = t('blocks.step.number', { n: meta.stepNumber });

  return (
    // step-block / step-line: CSS trong index.css nối các bước liền nhau thành timeline.
    <section id={meta.anchor} className="step-block avoid-break relative my-6 flex gap-4">
      {/* Đường nối dọc từ vòng số xuống bước kế tiếp */}
      <div aria-hidden className="step-line absolute top-11 bottom-0 left-5 w-0.5 -translate-x-1/2 rounded-full bg-accent/25" />
      <div
        aria-hidden
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-fg ring-4 ring-accent-soft"
      >
        {meta.stepNumber}
      </div>
      <div className="min-w-0 flex-1 pb-8">
        <h3 className="mt-1.5 mb-1 text-lg font-semibold">
          {/* Chữ "Bước 3:" ẩn trên màn hình (đã có vòng tròn số) nhưng vẫn
              được trình đọc màn hình đọc lên. */}
          <span className="sr-only">{label}: </span>
          {props.title || label}
        </h3>
        {props.text.trim() && <Markdown text={props.text} />}
        {props.image && (
          <div className="mt-3">
            <ZoomableImage src={props.image} alt={props.title || label} />
          </div>
        )}
      </div>
    </section>
  );
}
