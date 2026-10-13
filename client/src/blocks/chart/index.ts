import { ChartColumn } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import ChartEdit from './Edit.tsx';
import ChartView from './View.tsx';

export const chartBlock: BlockDefinition<'chart'> = {
  type: 'chart',
  icon: ChartColumn,
  // Hàng tiêu đề + 3 hàng số liệu trống, 1 chuỗi số liệu.
  create: () => ({
    kind: 'bar',
    title: '',
    unit: '',
    legend: true,
    stacked: false,
    rows: [
      ['', ''],
      ['', ''],
      ['', ''],
      ['', ''],
    ],
    colors: [],
  }),
  Edit: ChartEdit,
  View: ChartView,
};
