import type { StateStorage } from 'zustand/middleware';
import { desktopRuntime } from './runtime';

let pendingWrite = Promise.resolve();
export async function flushSettings(): Promise<void> {
  await pendingWrite;
}

export function storageFailure(): void {
  window.dispatchEvent(new CustomEvent('moyuhub:storage-error'));
}

/** Exactly one backing store per runtime; browser preview uses its own namespace. */
export const settingsStorage: StateStorage = {
  async getItem(key) {
    try {
      if (!desktopRuntime) return localStorage.getItem(key);
      const { load } = await import('@tauri-apps/plugin-store');
      return (
        (await (await load('settings.json', { defaults: {}, autoSave: false })).get<string>(key)) ??
        null
      );
    } catch {
      storageFailure();
      return null;
    }
  },
  setItem(key, value) {
    pendingWrite = pendingWrite.then(async () => {
      try {
        if (!desktopRuntime) {
          localStorage.setItem(key, value);
          return;
        }
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load('settings.json', { defaults: {}, autoSave: false });
        await store.set(key, value);
        await store.save();
      } catch {
        storageFailure();
      }
    });
    return pendingWrite;
  },
  async removeItem(key) {
    try {
      if (!desktopRuntime) {
        localStorage.removeItem(key);
        return;
      }
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load('settings.json', { defaults: {}, autoSave: false });
      await store.delete(key);
      await store.save();
    } catch {
      storageFailure();
    }
  },
};
