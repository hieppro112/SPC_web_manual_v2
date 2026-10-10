import { Type } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import ParagraphEdit from './Edit.tsx';
import ParagraphView from './View.tsx';

export const paragraphBlock: BlockDefinition<'paragraph'> = {
  type: 'paragraph',
  icon: Type,
  create: () => ({ text: '' }),
  Edit: ParagraphEdit,
  View: ParagraphView,
};
