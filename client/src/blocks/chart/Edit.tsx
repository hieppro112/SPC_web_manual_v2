// Soạn biểu đồ: chọn loại + nhập số liệu vào bảng (hoặc dán từ Excel),
// xem trước ngay bên dưới.
import type { ClipboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartNoAxesCombined,
  ChartPie,
  Donut,
  Minus,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import { cn } from '../../lib/utils.ts';
import type { BlockEditProps, ChartKind } from '../types.ts';
import { CHART_COLORS, CHART_KINDS, MAX_ROWS, MAX_SERIES, canStack, isPie, parseClipboardTable, pasteInto } from './data.ts';
import { ChartFigure } from './View.tsx';

const KIND_ICONS: Record<ChartKind, LucideIcon> = {
  bar: ChartColumn,
  barH: ChartBar,
  line: ChartLine,
  area: ChartArea,
  combo: ChartNoAxesCombined,
  pie: ChartPie,
  donut: Donut,
};

export default function ChartEdit({ props, onChange }: BlockEditProps<'chart'>) {
  const { t } = useTranslation();
  const rows = props.rows.length ? props.rows : [['', '']];
  const colCount = Math.max(...rows.map((r) => r.length), 2);
  const seriesCount = colCount - 1;

  const setRows = (next: string[][]) => onChange({ ...props, rows: next });
  const setCell = (r: number, c: number, value: string) =>
    setRows(rows.map((row, ri) => (ri === r ? Array.from({ length: colCount }, (_, ci) => (ci === c ? value : (row[ci] ?? ''))) : row)));

  const addRow = () => setRows([...rows, Array(colCount).fill('')]);
  const addSeries = () => setRows(rows.map((row) => [...row, ...Array(colCount - row.length).fill(''), '']));
  const removeRow = (r: number) => setRows(rows.filter((_, ri) => ri !== r));
  const removeSeries = (i: number) =>
    onChange({
      ...props,
      rows: rows.map((row) => row.filter((_, ci) => ci !== i + 1)),
      colors: props.colors.filter((_, ci) => ci !== i),
    });

  const setColor = (i: number, color: string) => {
    const colors = Array.from({ length: Math.max(props.colors.length, i + 1) }, (_, ci) => props.colors[ci] ?? '');
    colors[i] = color;
    onChange({ ...props, colors });
  };

  // Dán vùng ô copy từ Excel vào ô bất kỳ: tự trải ra các ô bên phải / bên dưới.
  // (Không dùng navigator.clipboard — trên http://192.168... trình duyệt không cho.)
  const onPaste = (r: number, c: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return; // dán 1 ô -> để trình duyệt tự xử lý
    e.preventDefault();
    setRows(pasteInto(rows, r, c, parseClipboardTable(text)));
  };

  const cellClass = 'w-28 bg-transparent px-2 py-1.5 text-sm focus:bg-accent-soft focus:outline-none';

  return (
    <div className="space-y-3">
      {/* Loại biểu đồ */}
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('blocks.chart.kind')}>
        {CHART_KINDS.map((kind) => {
          const Icon = KIND_ICONS[kind];
          const active = props.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ ...props, kind })}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm',
                active ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-border text-muted hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" /> {t(`blocks.chart.kinds.${kind}`)}
            </button>
          );
        })}
      </div>

      {/* Tiêu đề, đơn vị, tùy chọn */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={props.title}
          onChange={(e) => onChange({ ...props, title: e.target.value })}
          placeholder={t('blocks.chart.title')}
          className="min-w-48 flex-1"
        />
        <Input
          value={props.unit}
          onChange={(e) => onChange({ ...props, unit: e.target.value })}
          placeholder={t('blocks.chart.unit')}
          className="w-44"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={props.legend} onChange={(e) => onChange({ ...props, legend: e.target.checked })} />
          {t('blocks.chart.legend')}
        </label>
        {canStack(props.kind) && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={props.stacked} onChange={(e) => onChange({ ...props, stacked: e.target.checked })} />
            {t('blocks.chart.stacked')}
          </label>
        )}
      </div>

      {/* Bảng số liệu: hàng đầu = tên chuỗi, cột đầu = nhãn */}
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 ? 'bg-surface-2' : undefined}>
                {Array.from({ length: colCount }, (_, c) => {
                  const isHeader = r === 0;
                  const isLabel = c === 0;
                  return (
                    <td key={c} className="border border-border p-0">
                      <div className="flex items-center">
                        {isHeader && !isLabel && (
                          // Ô chọn màu của chuỗi số liệu
                          <input
                            type="color"
                            title={t('blocks.chart.color')}
                            value={props.colors[c - 1] || CHART_COLORS[(c - 1) % CHART_COLORS.length]}
                            onChange={(e) => setColor(c - 1, e.target.value)}
                            className="ml-1 h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                        )}
                        <input
                          value={row[c] ?? ''}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          onPaste={onPaste(r, c)}
                          placeholder={isHeader ? (isLabel ? t('blocks.chart.labelCol') : t('blocks.chart.seriesName', { n: c })) : ''}
                          // inputMode="decimal": điện thoại mở bàn phím số
                          inputMode={!isHeader && !isLabel ? 'decimal' : undefined}
                          className={cn(cellClass, isHeader && 'font-semibold', !isHeader && !isLabel && 'text-right tabular-nums')}
                        />
                      </div>
                    </td>
                  );
                })}
                <td className="pl-1">
                  {r > 0 && (
                    <button
                      type="button"
                      title={t('blocks.chart.removeRow')}
                      disabled={rows.length <= 2}
                      onClick={() => removeRow(r)}
                      className="rounded p-1 text-muted hover:text-danger disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td />
              {Array.from({ length: seriesCount }, (_, i) => (
                <td key={i} className="pt-1 text-center">
                  <button
                    type="button"
                    title={t('blocks.chart.removeSeries')}
                    disabled={seriesCount <= 1}
                    onClick={() => removeSeries(i)}
                    className="rounded p-1 text-muted hover:text-danger disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={addRow} disabled={rows.length > MAX_ROWS}>
          <Plus className="h-4 w-4" /> {t('blocks.chart.addRow')}
        </Button>
        <Button size="sm" variant="secondary" onClick={addSeries} disabled={seriesCount >= MAX_SERIES}>
          <Plus className="h-4 w-4" /> {t('blocks.chart.addSeries')}
        </Button>
        <span className="text-xs text-muted">{t('blocks.chart.pasteHint')}</span>
      </div>
      {isPie(props.kind) && seriesCount > 1 && <p className="text-xs text-warning">{t('blocks.chart.pieHint')}</p>}

      {/* Xem trước — tắt hiệu ứng để gõ số không bị "nhảy" liên tục */}
      <div className="rounded-xl border border-dashed border-border px-3">
        <ChartFigure props={props} animate={false} />
      </div>
    </div>
  );
}
