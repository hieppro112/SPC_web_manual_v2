// Một bước trong quy trình: số thứ tự to, tên bước, mô tả, ảnh minh họa.
import { useTranslation } from 'react-i18next';
import Markdown from '../../components/Markdown.tsx';
import ZoomableImage from '../../components/ZoomableImage.tsx';
import type { BlockViewProps } from '../types.ts';

export default function StepView({ props, meta }: BlockViewProps<'step'>) {
  const { t } = useTranslation();
  const label = t('blocks.step.number', { n: meta.stepNumber });

  return (
    <section id={meta.anchor} className="avoid-break my-6 flex gap-4">
      <div
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-fg"
      >
        {meta.stepNumber}
      </div>
      <div className="min-w-0 flex-1 border-b border-border pb-6">
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
