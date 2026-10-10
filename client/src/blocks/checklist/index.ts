import { ListChecks } from 'lucide-react';
import { newId } from '../../lib/utils.ts';
import type { BlockDefinition } from '../types.ts';
import ChecklistEdit from './Edit.tsx';
import ChecklistView from './View.tsx';

export const checklistBlock: BlockDefinition<'checklist'> = {
  type: 'checklist',
  icon: ListChecks,
  create: () => ({ items: [{ id: newId(), text: '' }] }),
  Edit: ChecklistEdit,
  View: ChecklistView,
};
