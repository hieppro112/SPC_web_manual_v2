import ZoomableImage from '../../components/ZoomableImage.tsx';
import type { BlockViewProps } from '../types.ts';

export default function DiagramView({ props }: BlockViewProps<'diagram'>) {
  if (!props.src) return null;
  return (
    <figure className="avoid-break my-6 flex flex-col items-center">
      {/* SVG xuất với màu sáng -> đặt trên nền trắng để giao diện tối vẫn đọc được. */}
      <ZoomableImage src={props.src} alt={props.caption} className="bg-white p-3" />
      {props.caption && <figcaption className="mt-2 text-center text-sm text-muted">{props.caption}</figcaption>}
    </figure>
  );
}
