import { useEffect, useLayoutEffect } from 'react';
import { BookOpen, Boxes, Disc3, Gamepad2, House, Minus, Pin, Settings, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../shared/ui';
import { Player } from '../features/music/Player';
import { useSettings } from '../features/settings/store';
import { useShell } from './shellStore';
import { applyDesktopSettings, closeWindow, minimizeWindow } from '../platform/desktop';
import { desktopRuntime } from '../platform/runtime';
import { errorMessage } from '../shared/lib/resource';
import { SteamDetailController } from '../features/steam/SteamDetailController';
import { MoyuLogo } from './MoyuLogo';

const navigation = [
  { to: '/', title: '首页', icon: House },
  { to: '/music', title: '网易云音乐', icon: Disc3 },
  { to: '/steam', title: 'Steam', icon: Gamepad2 },
  { to: '/heybox', title: '小黑盒', icon: Boxes },
  { to: '/reader', title: '阅读器', icon: BookOpen },
  { to: '/settings', title: '设置', icon: Settings },
];
export function AppLayout() {
  const location = useLocation();
  const { settings, update } = useSettings();
  const { notice, notify, material } = useShell();
  const reading = /^\/reader\/(novel|comic)(\/|$)/.test(location.pathname);
  const theme =
    reading && settings.readingTheme !== 'follow' ? settings.readingTheme : settings.theme;
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.runtime = desktopRuntime ? 'desktop' : 'browser';
    root.dataset.material = material;
    root.style.setProperty('--opacity', String(settings.opacity / 100));
    root.style.setProperty(
      '--panel',
      theme === 'dark'
        ? `rgba(22,35,46,${0.68 + settings.opacity * 0.0018})`
        : `rgba(248,252,255,${0.22 + settings.opacity * 0.006})`,
    );
    root.style.setProperty('--font-size', `${settings.readingSize}px`);
    root.style.setProperty('--reading-line', String(settings.readingLineHeight));
    root.style.setProperty('--reading-width', `${settings.readingWidth}px`);
    root.style.setProperty(
      '--font-family',
      settings.readingFont === '宋体'
        ? 'SimSun,"Songti SC",serif'
        : settings.readingFont === '楷体'
          ? 'KaiTi,STKaiti,serif'
          : '"Microsoft YaHei",sans-serif',
    );
  }, [
    theme,
    material,
    settings.opacity,
    settings.readingSize,
    settings.readingLineHeight,
    settings.readingWidth,
    settings.readingFont,
  ]);
  useEffect(() => {
    void applyDesktopSettings({ ...settings, theme }).catch((error: unknown) =>
      notify(errorMessage(error)),
    );
  }, [theme, settings.alwaysOnTop, settings.blurStrength, notify]);
  useEffect(() => {
    if (
      !reading &&
      navigation.some((item) => item.to === location.pathname) &&
      settings.lastPage !== location.pathname
    )
      update('lastPage', location.pathname);
  }, [location.pathname, reading, settings.lastPage, update]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(null), 5000);
    return () => clearTimeout(timer);
  }, [notice, notify]);
  const windowAction = (action: () => Promise<void>) => {
    void action().catch((error: unknown) => notify(errorMessage(error)));
  };
  return (
    <div className={`app-preview ${desktopRuntime ? 'app-desktop' : ''}`}>
      <div className={`app-window ${reading ? 'app-reading' : ''}`}>
        <div className="app-drag-area" data-tauri-drag-region aria-hidden="true" />
        <div className="app-titlebar">
          <Button
            variant="icon"
            aria-label="窗口置顶"
            title="窗口置顶"
            aria-pressed={settings.alwaysOnTop}
            disabled={!desktopRuntime}
            className={settings.alwaysOnTop ? 'app-active-pin' : ''}
            onClick={() => update('alwaysOnTop', !settings.alwaysOnTop)}
          >
            <Pin />
          </Button>
          <Button
            variant="icon"
            aria-label="最小化"
            title="最小化"
            disabled={!desktopRuntime}
            onClick={() => windowAction(minimizeWindow)}
          >
            <Minus />
          </Button>
          <Button
            variant="icon"
            aria-label="关闭窗口"
            title="关闭窗口"
            disabled={!desktopRuntime}
            onClick={() => windowAction(closeWindow)}
          >
            <X />
          </Button>
        </div>
        <aside className="app-sidebar">
          <div className="app-brand">
            <MoyuLogo />
            <div className="app-brand-text">
              <strong>MoyuHub</strong>
            </div>
          </div>
          <nav className="app-nav" aria-label="主要导航">
            {navigation.map(({ to, title, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => (isActive ? 'ui-active' : '')}
              >
                <Icon aria-hidden="true" />
                <span>{title}</span>
              </NavLink>
            ))}
          </nav>
          <p className="app-sidebar-note">你的进度与偏好，留在这里。</p>
        </aside>
        <main className={`app-main ${reading ? 'app-reader-main' : ''}`} key={location.pathname}>
          <Outlet />
        </main>
        <Player />
        <SteamDetailController />
      </div>
      {notice && (
        <div id="toast-root" role="status">
          <div className="app-toast">{notice}</div>
        </div>
      )}
    </div>
  );
}
