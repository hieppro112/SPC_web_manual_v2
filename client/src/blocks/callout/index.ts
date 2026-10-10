import { TriangleAlert } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import CalloutEdit from './Edit.tsx';
import CalloutView from './View.tsx';

export const calloutBlock: BlockDefinition<'callout'> = {
  type: 'callout',
  icon: TriangleAlert,
  create: () => ({ variant: 'warning', text: '' }),
  Edit: CalloutEdit,
  View: CalloutView,
};
