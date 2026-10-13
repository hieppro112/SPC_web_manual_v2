// ============================================================
// ChartRenderer — vẽ chart bằng Recharts (file DUY NHẤT import recharts)
// ============================================================
// File này được tải "lười" (React.lazy ở View.tsx): trình duyệt chỉ tải
// thư viện chart khi tài liệu thật sự có khối biểu đồ.
//
// Recharts = chart dạng component: <ComposedChart> chứa <XAxis>, <Bar>,
// <Line>... giống lồng widget trong Flutter (fl_chart thì cấu hình bằng object).

import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartKind } from '../types.ts';
import { CHART_COLORS, isPie, type ChartData } from './data.ts';

type Props = {
  data: ChartData;
  kind: ChartKind;
  unit: string;
  legend: boolean;
  stacked: boolean;
  animate: boolean;
};

// Màu chữ / lưới / tooltip lấy từ design token -> tự đổi theo sáng / tối.
const TICK = { fill: 'var(--app-muted)', fontSize: 12 };
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--app-bg)',
  border: '1px solid var(--app-border)',
  borderRadius: 8,
  color: 'var(--app-fg)',
  fontSize: 13,
};

// Recharts mặc định xếp chú thích / tooltip theo ABC. Giữ đúng thứ tự cột
// người dùng nhập: key 's0', 's1', ... -> 0, 1, ...
const seriesOrder = (key: unknown) => Number(String(key).replace(/^s/, '')) || 0;
// Chữ chú thích dùng màu chữ thường (mặc định Recharts tô theo màu chuỗi, khó đọc).
const legendText = (value: unknown) => <span style={{ color: 'var(--app-fg)' }}>{String(value)}</span>;

export default function ChartRenderer({ data, kind, unit, legend, stacked, animate }: Props) {
  const { i18n } = useTranslation();
  const nf = new Intl.NumberFormat(i18n.language);
  const fmt = (v: unknown) => (typeof v === 'number' ? `${nf.format(v)}${unit ? ` ${unit}` : ''}` : String(v ?? ''));

  if (isPie(kind)) {
    // Biểu đồ tròn: mỗi NHÃN là một miếng, lấy số của chuỗi đầu tiên.
    const first = data.series[0];
    const slices = data.points
      .map((p) => ({ name: p.label, value: first ? p[first.key] : null }))
      .filter((s): s is { name: string; value: number } => typeof s.value === 'number' && s.value > 0);
    return (
      <ResponsiveContainer width="100%" height={340}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={kind === 'donut' ? '50%' : 0}
            outerRadius="78%"
            isAnimationActive={animate}
            label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
          >
            {slices.map((s, i) => (
              <Cell key={s.name + i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--app-bg)" />
            ))}
          </Pie>
          <Tooltip formatter={fmt} contentStyle={TOOLTIP_STYLE} />
          {legend && (
            <Legend
              formatter={legendText}
              itemSorter={(item) => slices.findIndex((s) => s.name === item.value)}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // Cột ngang: đổi vai trò 2 trục (layout="vertical"), chiều cao theo số nhãn.
  const horizontal = kind === 'barH';
  const height = horizontal ? Math.max(240, data.points.length * 36 + 70) : 340;
  const stackId = stacked ? 'stack' : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data.points} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--app-border)" strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={TICK} tickFormatter={(v: number) => nf.format(v)} stroke="var(--app-border)" />
            <YAxis type="category" dataKey="label" tick={TICK} width={110} stroke="var(--app-border)" />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={TICK} stroke="var(--app-border)" />
            <YAxis tick={TICK} tickFormatter={(v: number) => nf.format(v)} stroke="var(--app-border)" />
          </>
        )}
        <Tooltip
          formatter={fmt}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'var(--app-surface-2)' }}
          itemSorter={(item) => seriesOrder(item.dataKey)}
        />
        {legend && <Legend formatter={legendText} itemSorter={(item) => seriesOrder(item.dataKey)} />}

        {data.series.map((s, i) => {
          // Kết hợp: chuỗi đầu là cột, các chuỗi sau là đường.
          const asLine = kind === 'line' || (kind === 'combo' && i > 0);
          if (asLine) {
            return (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2.5}
                type="monotone"
                connectNulls
                isAnimationActive={animate}
              />
            );
          }
          if (kind === 'area') {
            return (
              <Area
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.25}
                type="monotone"
                stackId={stackId}
                isAnimationActive={animate}
              />
            );
          }
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              stackId={stackId}
              radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={56}
              isAnimationActive={animate}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
