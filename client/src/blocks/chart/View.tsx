import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle } from 'lucide-react';
import type { BlockPropsMap, BlockViewProps } from '../types.ts';
import { toChartData } from './data.ts';

// React.lazy: tách ChartRenderer (+ Recharts) thành file JS riêng, chỉ tải
// khi lần đầu cần vẽ. <Suspense> hiện chỗ trống trong lúc chờ tải.
// 🔸 Flutter: giống "deferred import" (import ... deferred as ...).
const ChartRenderer = lazy(() => import('./ChartRenderer.tsx'));

type FigureProps = { props: BlockPropsMap['chart']; animate?: boolean };

// Dùng chung cho trang đọc và phần xem trước trong trình soạn.
export function ChartFigure({ props, animate = true }: FigureProps) {
  const { t } = useTranslation();
  const data = useMemo(() => toChartData(props), [props]);

  if (!data.hasData) {
    return animate ? null : <p className="py-6 text-center text-sm text-muted">{t('blocks.chart.empty')}</p>;
  }

  return (
    <figure className="avoid-break chart-figure my-6">
      {(props.title || props.unit) && (
        <figcaption className="mb-2 text-center">
          {props.title && <span className="font-semibold">{props.title}</span>}
          {props.unit && <span className="ml-2 text-sm text-muted">({t('blocks.chart.unitLabel', { unit: props.unit })})</span>}
        </figcaption>
      )}
      <Suspense
        fallback={
          <div className="flex h-[340px] items-center justify-center text-muted">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        }
      >
        <ChartRenderer
          data={data}
          kind={props.kind}
          unit={props.unit}
          legend={props.legend}
          stacked={props.stacked}
          animate={animate}
        />
      </Suspense>
    </figure>
  );
}

export default function ChartView({ props }: BlockViewProps<'chart'>) {
  return <ChartFigure props={props} />;
}
