// Soạn bảng bằng lưới ô nhập. Bảng luôn giữ hình chữ nhật: thêm cột là
// thêm một ô vào MỌI hàng.
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import { cn } from '../../lib/utils.ts';
import type { BlockEditProps } from '../types.ts';

export default function TableEdit({ props, onChange }: BlockEditProps<'table'>) {
  const { t } = useTranslation();
  const rows = props.rows.length ? props.rows : [['']];
  const colCount = Math.max(...rows.map((r) => r.length), 1);

  // Mọi thay đổi đều tạo mảng MỚI bằng map (không sửa mảng cũ tại chỗ),
  // vì React so sánh bằng tham chiếu để biết có cần vẽ lại không.
  const setCell = (r: number, c: number, value: string) =>
    onChange({ ...props, rows: rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)) });

  const addRow = () => onChange({ ...props, rows: [...rows, Array(colCount).fill('')] });
  const addCol = () => onChange({ ...props, rows: rows.map((row) => [...row, '']) });
  const removeRow = (r: number) => onChange({ ...props, rows: rows.filter((_, ri) => ri !== r) });
  const removeCol = (c: number) => onChange({ ...props, rows: rows.map((row) => row.filter((_, ci) => ci !== c)) });

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={props.header} onChange={(e) => onChange({ ...props, header: e.target.checked })} />
        {t('blocks.table.header')}
      </label>

      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: colCount }, (_, c) => (
                  <td key={c} className="border border-border p-0">
                    <input
                      value={row[c] ?? ''}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      className={cn(
                        'w-36 bg-transparent px-2 py-1.5 text-sm focus:bg-accent-soft focus:outline-none',
                        props.header && r === 0 && 'font-semibold',
                      )}
                    />
                  </td>
                ))}
                <td className="pl-1">
                  <button
                    type="button"
                    title={t('blocks.table.removeRow')}
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(r)}
                    className="rounded p-1 text-muted hover:text-danger disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              {Array.from({ length: colCount }, (_, c) => (
                <td key={c} className="pt-1 text-center">
                  <button
                    type="button"
                    title={t('blocks.table.removeCol')}
                    disabled={colCount <= 1}
                    onClick={() => removeCol(c)}
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

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={addRow}>
          <Plus className="h-4 w-4" /> {t('blocks.table.addRow')}
        </Button>
        <Button size="sm" variant="secondary" onClick={addCol} disabled={colCount >= 20}>
          <Plus className="h-4 w-4" /> {t('blocks.table.addCol')}
        </Button>
      </div>
    </div>
  );
}
