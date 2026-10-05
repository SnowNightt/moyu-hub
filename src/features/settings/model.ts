export type Theme = 'light' | 'dark';
export type Settings = {
  theme: Theme;
  opacity: number;
  blurStrength: number;
  alwaysOnTop: boolean;
  rememberPosition: boolean;
  startHome: boolean;
  closeBehavior: 'tray' | 'exit';
  volume: number;
  restoreMusic: boolean;
  readingMode: 'scroll' | 'page';
  readingFont: '宋体' | '微软雅黑' | '楷体';
  readingSize: number;
  readingLineHeight: number;
  readingWidth: number;
  readingTheme: 'follow' | Theme;
  comicCacheLimitMB: number;
  lastPage: string;
};

export const defaultSettings: Settings = {
  theme: 'light',
  opacity: 40,
  blurStrength: 40,
  alwaysOnTop: false,
  rememberPosition: true,
  startHome: true,
  closeBehavior: 'tray',
  volume: 60,
  restoreMusic: true,
  readingMode: 'scroll',
  readingFont: '宋体',
  readingSize: 20,
  readingLineHeight: 1.8,
  readingWidth: 680,
  readingTheme: 'follow',
  comicCacheLimitMB: 1024,
  lastPage: '/',
};

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback;
}

/** Whitelist persisted fields. Old/invalid storage never becomes the settings truth. */
export function validateSettings(value: unknown): Settings {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const defaults = defaultSettings;
  return {
    theme: choice(data.theme, ['light', 'dark'], defaults.theme),
    opacity: numberIn(data.opacity, defaults.opacity, 0, 100),
    blurStrength: numberIn(data.blurStrength, defaults.blurStrength, 0, 100),
    alwaysOnTop: typeof data.alwaysOnTop === 'boolean' ? data.alwaysOnTop : defaults.alwaysOnTop,
    rememberPosition:
      typeof data.rememberPosition === 'boolean'
        ? data.rememberPosition
        : defaults.rememberPosition,
    startHome: typeof data.startHome === 'boolean' ? data.startHome : defaults.startHome,
    closeBehavior: choice(data.closeBehavior, ['tray', 'exit'], defaults.closeBehavior),
    volume: numberIn(data.volume, defaults.volume, 0, 100),
    restoreMusic:
      typeof data.restoreMusic === 'boolean' ? data.restoreMusic : defaults.restoreMusic,
    readingMode: choice(data.readingMode, ['scroll', 'page'], defaults.readingMode),
    readingFont: choice(data.readingFont, ['宋体', '微软雅黑', '楷体'], defaults.readingFont),
    readingSize: numberIn(data.readingSize, defaults.readingSize, 14, 30),
    readingLineHeight: numberIn(data.readingLineHeight, defaults.readingLineHeight, 1.2, 2.6),
    readingWidth: numberIn(data.readingWidth, defaults.readingWidth, 360, 900),
    readingTheme: choice(data.readingTheme, ['follow', 'light', 'dark'], defaults.readingTheme),
    comicCacheLimitMB: numberIn(data.comicCacheLimitMB, defaults.comicCacheLimitMB, 256, 4096),
    lastPage: choice(
      data.lastPage,
      ['/', '/music', '/steam', '/heybox', '/reader', '/settings'],
      '/',
    ),
  };
}
