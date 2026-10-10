import { Paperclip } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import FileEdit from './Edit.tsx';
import FileView from './View.tsx';

export const fileBlock: BlockDefinition<'file'> = {
  type: 'file',
  icon: Paperclip,
  create: () => ({ src: '', name: '', size: 0 }),
  Edit: FileEdit,
  View: FileView,
};
