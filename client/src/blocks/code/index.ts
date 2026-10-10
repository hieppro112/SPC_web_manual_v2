import { SquareCode } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import CodeEdit from './Edit.tsx';
import CodeView from './View.tsx';

export const codeBlock: BlockDefinition<'code'> = {
  type: 'code',
  icon: SquareCode,
  create: () => ({ language: '', code: '' }),
  Edit: CodeEdit,
  View: CodeView,
};
