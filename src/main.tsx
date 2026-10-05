import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ServicesContext, createAppServices } from './app/services';
import { useSettings } from './features/settings/store';
import { useShell } from './app/shellStore';
import { initializeDesktop } from './platform/desktop';
import { desktopRuntime } from './platform/runtime';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './shared/styles/tokens.css';
import './shared/styles/reference.css';
import './shared/styles/shell.css';

window.addEventListener('moyuhub:storage-error', () => {
  useShell.setState({ storageError: true });
  useShell.getState().notify('偏好未能保存到本机，当前会话仍可继续使用。');
});

async function bootstrap() {
  await useSettings.persist.rehydrate();
  const services = await createAppServices();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <ServicesContext.Provider value={services}>
          <RouterProvider router={router} />
        </ServicesContext.Provider>
      </ErrorBoundary>
    </StrictMode>,
  );
  // The router must mount before transition-aware navigation can complete.
  // Browser deep links remain available for visual checks.
  if (desktopRuntime) {
    const { settings } = useSettings.getState();
    void router.navigate(settings.startHome ? '/' : settings.lastPage, { replace: true });
  }
  try {
    await initializeDesktop();
  } catch (error) {
    useShell
      .getState()
      .notify(`桌面初始化未完成：${error instanceof Error ? error.message : '请重新打开应用'}`);
    if (desktopRuntime) await getCurrentWindow().show();
  }
}
void bootstrap();
