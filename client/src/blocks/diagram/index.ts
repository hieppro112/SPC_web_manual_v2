import { Workflow } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import DiagramEdit from './Edit.tsx';
import DiagramView from './View.tsx';

export const diagramBlock: BlockDefinition<'diagram'> = {
  type: 'diagram',
  icon: Workflow,
  create: () => ({ xml: '', src: '', caption: '' }),
  Edit: DiagramEdit,
  View: DiagramView,
};
