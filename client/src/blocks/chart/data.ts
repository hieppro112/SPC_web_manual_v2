// ============================================================
// blocks/chart/data.ts — Đổi bảng chữ người dùng nhập thành dữ liệu vẽ chart
// ============================================================
// Hàm thuần, không đụng React, không phụ thuộc Recharts -> dùng được cả
// lúc soạn (Edit) lẫn lúc đọc (View) mà không phải tải thư viện chart.

import type { BlockPropsMap, ChartKind } from '../types.ts';

// Bảng màu mặc định: đủ tương phản trên cả nền sáng lẫn nền tối.
export const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export const CHART_KINDS: ChartKind[] = ['bar', 'barH', 'line', 'area', 'combo', 'pie', 'donut'];
export const isPie = (kind: ChartKind) => kind === 'pie' || kind === 'donut';
// Loại nào có tùy chọn "xếp chồng".
export const canStack = (kind: ChartKind) => kind === 'bar' || kind === 'barH' || kind === 'area';

export const MAX_SERIES = 20;
export const MAX_ROWS = 500;

// Đọc số kiểu Việt Nam lẫn kiểu Anh:
//   "1.234,5" -> 1234.5     "1,234.5" -> 1234.5
//   "12,5"    -> 12.5       "1 200"   -> 1200      "35%" -> 35
// Ô trống / không phải số -> null (chart để trống điểm đó, không vẽ thành 0).
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[\s%]/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type ChartSeries = { key: string; name: string; color: string };
export type ChartPoint = { label: string } & Record<string, number | string | null>;
export type ChartData = { series: ChartSeries[]; points: ChartPoint[]; hasData: boolean };

export function toChartData(props: BlockPropsMap['chart']): ChartData {
  const [header = [], ...body] = props.rows;
  const colCount = Math.max(header.length, ...body.map((r) => r.length), 1);

  // key 's0', 's1'...: không dùng tên chuỗi làm key vì tên có thể trùng / rỗng.
  const series: ChartSeries[] = Array.from({ length: colCount - 1 }, (_, i) => ({
    key: `s${i}`,
    name: header[i + 1]?.trim() || `#${i + 1}`,
    color: props.colors[i] || CHART_COLORS[i % CHART_COLORS.length],
  }));

  const points = body
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const point: ChartPoint = { label: row[0]?.trim() ?? '' };
      series.forEach((s, i) => {
        point[s.key] = parseNumber(row[i + 1] ?? '');
      });
      return point;
    });

  const hasData = points.some((p) => series.some((s) => p[s.key] !== null));
  return { series, points, hasData };
}

// Dữ liệu copy từ Excel / Google Sheets: các ô cách nhau bằng Tab, các hàng
// cách nhau bằng xuống dòng.
export function parseClipboardTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop(); // Excel luôn thêm một dòng trống ở cuối
  return lines.map((line) => line.split('\t'));
}

// Dán một khối ô vào bảng tại vị trí (r, c), tự nới rộng bảng nếu cần.
export function pasteInto(rows: string[][], r: number, c: number, block: string[][]): string[][] {
  const height = Math.min(Math.max(rows.length, r + block.length), MAX_ROWS + 1);
  const width = Math.min(Math.max(...rows.map((row) => row.length), c + Math.max(...block.map((b) => b.length))), MAX_SERIES + 1);
  return Array.from({ length: height }, (_, ri) =>
    Array.from({ length: width }, (_, ci) => block[ri - r]?.[ci - c] ?? rows[ri]?.[ci] ?? ''),
  );
}
