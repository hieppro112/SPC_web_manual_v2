import { Video } from 'lucide-react';
import type { BlockDefinition } from '../types.ts';
import VideoEdit from './Edit.tsx';
import VideoView from './View.tsx';

export const videoBlock: BlockDefinition<'video'> = {
  type: 'video',
  icon: Video,
  create: () => ({ src: '', caption: '' }),
  Edit: VideoEdit,
  View: VideoView,
};
