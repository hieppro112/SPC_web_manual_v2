import ZoomableImage from '../../components/ZoomableImage.tsx';
import type { BlockViewProps } from '../types.ts';

export default function ImageView({ props }: BlockViewProps<'image'>) {
  if (!props.src) return null;
  return (
    // <figure> + <figcaption>: cặp thẻ HTML đúng nghĩa cho "ảnh kèm chú thích".
    <figure className="avoid-break my-6 flex flex-col items-center">
      <ZoomableImage src={props.src} alt={props.alt || props.caption} />
      {props.caption && <figcaption className="mt-2 text-center text-sm text-muted">{props.caption}</figcaption>}
    </figure>
  );
}
