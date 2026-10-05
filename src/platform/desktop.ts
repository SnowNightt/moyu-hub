import { getCurrentWindow, Effect, EffectState } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { defaultWindowIcon } from '@tauri-apps/api/app';
import { Menu } from '@tauri-apps/api/menu';
import { TrayIcon } from '@tauri-apps/api/tray';
import { exit } from '@tauri-apps/plugin-process';
import { restoreStateCurrent, saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state';
import type { Settings, Theme } from '../features/settings/model';
import { useSettings } from '../features/settings/store';
import { useShell } from '../app/shellStore';
import { errorMessage } from '../shared/lib/resource';
import { desktopRuntime } from './runtime';
import { latestTask } from './latestTask';
import { flushSettings } from './storage';
import { flushReaderSessions, finishReaderImports } from '../features/reader/lifecycle';

let tray: TrayIcon | null = null;
let trayMenu: Menu | null = null;
let previousTheme: Theme | null = null;
let previousStrength: number | null = null;
let adjustableBlur = false;
let blurFailed = false;
let previousAlwaysOnTop: boolean | null = null;

async function systemGlass(theme: Theme) {
  try {
    await getCurrentWindow().setEffects({
      effects: [await invoke<Effect>('desktop_window_effect')],
      state: EffectState.Active,
      color: theme === 'dark' ? [12, 23, 34, 1] : [240, 247, 251, 1],
    });
    useShell.setState({ material: 'native' });
  } catch {
    useShell.setState({ material: 'unavailable' });
  }
}

const applyAppearance = latestTask(async (settings: Settings) => {
  const window = getCurrentWindow();
  const themeChanged = previousTheme !== settings.theme;
  if (themeChanged) await window.setTheme(settings.theme);
  if (!blurFailed && (themeChanged || previousStrength !== settings.blurStrength)) {
    try {
      if (!adjustableBlur) await window.clearEffects();
      await invoke('set_desktop_blur', { strength: Math.round(settings.blurStrength) });
      adjustableBlur = true;
      useShell.setState({ material: 'native', blurControl: 'ready' });
    } catch (error) {
      console.warn('Desktop blur unavailable:', error);
      blurFailed = true;
      adjustableBlur = false;
      useShell.setState({ blurControl: 'unavailable' });
      await systemGlass(settings.theme);
      useShell.getState().notify('当前系统无法调节模糊强度，已尝试恢复系统玻璃材质。');
    }
  } else if (blurFailed && themeChanged) {
    await systemGlass(settings.theme);
  }
  previousTheme = settings.theme;
  previousStrength = settings.blurStrength;
});

export async function applyDesktopSettings(settings: Settings): Promise<void> {
  if (!desktopRuntime) return;
  const window = getCurrentWindow();
  if (previousAlwaysOnTop !== settings.alwaysOnTop) {
    await window.setAlwaysOnTop(settings.alwaysOnTop);
    previousAlwaysOnTop = settings.alwaysOnTop;
  }
  await applyAppearance(settings);
}

async function savePosition(): Promise<void> {
  if (useSettings.getState().settings.rememberPosition) await saveWindowState(StateFlags.POSITION);
}
export async function closeWindow(): Promise<void> {
  if (!desktopRuntime) return;
  await flushSettings();
  await flushReaderSessions();
  await savePosition();
  if (useSettings.getState().settings.closeBehavior === 'tray' && tray)
    await getCurrentWindow().hide();
  else {
    await finishReaderImports();
    await exit(0);
  }
}
export async function minimizeWindow(): Promise<void> {
  if (desktopRuntime) await getCurrentWindow().minimize();
}

/** Desktop plumbing only; the native command selects the OS-compatible glass effect. */
export async function initializeDesktop(): Promise<void> {
  if (!desktopRuntime) return;
  const window = getCurrentWindow();
  await window.listen('desktop-blur-unavailable', () => {
    blurFailed = true;
    adjustableBlur = false;
    useShell.setState({ blurControl: 'unavailable' });
    void systemGlass(previousTheme ?? useSettings.getState().settings.theme);
    useShell.getState().notify('桌面模糊暂时不可用，已尝试恢复系统玻璃材质。');
  });
  try {
    // A frontend reload retains native resources; replace the previous tray and its callbacks.
    const previousTray = await TrayIcon.getById('moyuhub-tray');
    await previousTray?.close();
    const show = async () => {
      await window.show();
      await window.unminimize();
      await window.setFocus();
    };
    trayMenu = await Menu.new({
      items: [
        {
          id: 'show',
          text: '打开 MoyuHub',
          action: () => {
            void show();
          },
        },
        {
          id: 'pin',
          text: '切换窗口置顶',
          action: () => {
            const store = useSettings.getState();
            store.update('alwaysOnTop', !store.settings.alwaysOnTop);
          },
        },
        { item: 'Separator' },
        {
          id: 'exit',
          text: '退出 MoyuHub',
          action: () => {
            void flushSettings()
              .then(flushReaderSessions)
              .then(finishReaderImports)
              .then(savePosition)
              .then(() => exit(0))
              .catch((error) => useShell.getState().notify(errorMessage(error)));
          },
        },
      ],
    });
    tray = await TrayIcon.new({
      id: 'moyuhub-tray',
      icon: (await defaultWindowIcon()) ?? undefined,
      tooltip: 'MoyuHub',
      menu: trayMenu,
      menuOnLeftClick: false,
      action: (event) => {
        if (event.type === 'DoubleClick' && event.button === 'Left') void show();
      },
    });
    useShell.setState({ trayReady: true });
  } catch {
    useShell.getState().notify('托盘创建失败，关闭窗口将直接退出应用。');
  }
  if (useSettings.getState().settings.rememberPosition) {
    try {
      await restoreStateCurrent(StateFlags.POSITION);
    } catch {
      /* First launch has no saved position. */
    }
  }
  await window.onCloseRequested((event) => {
    event.preventDefault();
    void closeWindow().catch((error: unknown) => useShell.getState().notify(errorMessage(error)));
  });
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  await window.onMoved(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void savePosition().catch((error: unknown) =>
        useShell.getState().notify(errorMessage(error)),
      );
    }, 300);
  });
  await applyDesktopSettings(useSettings.getState().settings);
  await window.show();
  await window.setFocus();
}
