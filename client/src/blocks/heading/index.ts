import { Heading } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import HeadingEdit from './Edit.tsx';
import HeadingView from './View.tsx';

export const headingBlock: BlockDefinition<'heading'> = {
  type: 'heading',
  icon: Heading,
  create: () => ({ text: '', level: 2 }),
  Edit: HeadingEdit,
  View: HeadingView,
};
