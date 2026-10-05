import { create } from 'zustand';
import type { Song } from './model';

/** Application-scoped state, independent of music route lifetime. No simulated playback. */
export const usePlayer = create<{
  current: Song | null;
  queue: Song[];
  playing: boolean;
  position: number;
  select: (song: Song | null) => void;
}>((set) => ({
  current: null,
  queue: [],
  playing: false,
  position: 0,
  select: (current) => set({ current, playing: false, position: 0 }),
}));
