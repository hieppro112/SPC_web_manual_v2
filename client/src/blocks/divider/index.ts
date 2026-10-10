import { Minus } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import DividerEdit from './Edit.tsx';
import DividerView from './View.tsx';

export const dividerBlock: BlockDefinition<'divider'> = {
  type: 'divider',
  icon: Minus,
  create: () => ({}),
  Edit: DividerEdit,
  View: DividerView,
};
