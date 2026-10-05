import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { settingsStorage, storageFailure } from '../../platform/storage';
import { defaultSettings, validateSettings } from './model';
import type { Settings } from './model';

type SettingsStore = {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      update: (key, value) =>
        set((state) => ({ settings: validateSettings({ ...state.settings, [key]: value }) })),
    }),
    {
      name: 'moyuhub-settings-v1',
      version: 1,
      storage: createJSONStorage(() => settingsStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) storageFailure();
      },
      partialize: (state) => ({ settings: state.settings }),
      migrate: (state) => ({
        settings: validateSettings((state as { settings?: unknown })?.settings),
      }),
      merge: (saved, current) => ({
        ...current,
        settings: validateSettings((saved as { settings?: unknown })?.settings),
      }),
    },
  ),
);
