import { Image } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import ImageEdit from './Edit.tsx';
import ImageView from './View.tsx';

export const imageBlock: BlockDefinition<'image'> = {
  type: 'image',
  icon: Image,
  create: () => ({ src: '', alt: '', caption: '' }),
  Edit: ImageEdit,
  View: ImageView,
};
