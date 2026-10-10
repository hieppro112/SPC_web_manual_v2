import { Table } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import TableEdit from './Edit.tsx';
import TableView from './View.tsx';

export const tableBlock: BlockDefinition<'table'> = {
  type: 'table',
  icon: Table,
  create: () => ({
    header: true,
    rows: [
      ['', ''],
      ['', ''],
    ],
  }),
  Edit: TableEdit,
  View: TableView,
};
