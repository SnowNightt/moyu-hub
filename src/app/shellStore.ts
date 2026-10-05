import { create } from 'zustand';

type ShellState = {
  notice: string | null;
  storageError: boolean;
  trayReady: boolean;
  material: 'browser' | 'native' | 'unavailable';
  blurControl: 'pending' | 'ready' | 'unavailable';
  notify: (message: string | null) => void;
};
export const useShell = create<ShellState>((set) => ({
  notice: null,
  storageError: false,
  trayReady: false,
  material: 'browser',
  blurControl: 'pending',
  notify: (notice) => set({ notice }),
}));
