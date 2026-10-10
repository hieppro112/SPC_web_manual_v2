import { Footprints } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import StepEdit from './Edit.tsx';
import StepView from './View.tsx';

export const stepBlock: BlockDefinition<'step'> = {
  type: 'step',
  icon: Footprints,
  create: () => ({ title: '', text: '', image: '' }),
  Edit: StepEdit,
  View: StepView,
};
