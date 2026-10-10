import type { BlockViewProps } from '../types.ts';

export default function TableView({ props }: BlockViewProps<'table'>) {
  // Bỏ hàng trống hoàn toàn (người soạn thêm dư).
  const rows = props.rows.filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length) return null;

  const head = props.header ? rows[0] : null;
  const body = props.header ? rows.slice(1) : rows;

  return (
    // overflow-x-auto: bảng nhiều cột trên điện thoại thì cuộn ngang trong
    // khung, không làm vỡ bố cục cả trang.
    <div className="avoid-break my-5 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        {head && (
          <thead className="bg-surface-2">
            <tr>
              {head.map((cell, i) => (
                <th key={i} className="border-b border-border px-3 py-2 text-left font-semibold">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="even:bg-surface">
              {row.map((cell, c) => (
                <td key={c} className="border-t border-border px-3 py-2 align-top whitespace-pre-line">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
