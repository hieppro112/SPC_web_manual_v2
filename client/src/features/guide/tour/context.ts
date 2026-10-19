// tour/context.ts — Cho mọi trang gọi tour / gợi ý mà không phải truyền props qua nhiều tầng.
// 🔸 Flutter: giống InheritedWidget / Provider — đặt một lần ở trên cùng, con cháu nào cũng lấy được.
import { createContext, useContext } from 'react';
import type { TaskKey } from '../tasks.ts';
import type { TourId } from './tours.ts';

export type Hint = {
  title: string;
  body: string;
  target?: string; // data-tour cần chỉ vào
  route?: string | null; // mở trang này trước (null = ở yên)
  task?: TaskKey; // nhiệm vụ xong -> tự đóng gợi ý
};

export type TourApi = {
  startTour: (id: TourId) => void;
  showHint: (hint: Hint) => void;
};

export const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const api = useContext(TourContext);
  if (!api) throw new Error('useTour() phải nằm trong <TourProvider>');
  return api;
}
