import { useCallback, useState } from 'react';
import {
  BookOpen,
  CircleCheck,
  Database,
  Layers,
  Monitor,
  Moon,
  Music2,
  Palette,
  Sun,
} from 'lucide-react';
import { Button, PageHeader, Panel, Slider, Switch } from '../../shared/ui';
import { useSettings } from './store';
import { useShell } from '../../app/shellStore';
import { desktopRuntime } from '../../platform/runtime';
import { useServices } from '../../app/services';
import { useResource } from '../../shared/lib/useResource';
import type { ReactNode } from 'react';
import type { Settings } from './model';

function Row({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`setting-row ${className}`}>
      <span className="setting-label">
        {label}
        {hint && <small className="row-hint">{hint}</small>}
      </span>
      {children}
    </div>
  );
}
function RangeRow({
  label,
  value,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Row label={label} hint={hint} className="range-row">
      <div className="range-control">
        <Slider label={label} value={value} onChange={onChange} disabled={disabled} />
        <output>{value}%</output>
      </div>
    </Row>
  );
}
function Select<K extends keyof Settings>({
  field,
  label,
  choices,
}: {
  field: K;
  label: string;
  choices: { value: Settings[K]; label: string }[];
}) {
  const { settings, update } = useSettings();
  return (
    <select
      className="select"
      aria-label={label}
      value={String(settings[field])}
      onChange={(event) => {
        const selected = choices.find((item) => String(item.value) === event.target.value);
        if (selected) update(field, selected.value);
      }}
    >
      {choices.map((item) => (
        <option key={String(item.value)} value={String(item.value)}>
          {item.label}
        </option>
      ))}
    </select>
  );
}
export function SettingsPage() {
  const { settings, update } = useSettings();
  const { storageError, material, blurControl, trayReady } = useShell();
  const { cache, reader } = useServices();
  const loadCache = useCallback(
    async () => (await cache!.usageBytes()) + (reader ? await reader.cacheUsage() : 0),
    [cache, reader],
  );
  const usage = useResource(cache ? loadCache : undefined);
  const [clearing, setClearing] = useState(false);
  const clearCache = async () => {
    if (!cache || clearing) return;
    setClearing(true);
    try {
      await cache.clearRemoteCache();
      await reader?.clearCache();
      usage.retry();
      useShell.getState().notify('缓存已清理，书库、进度和书签已保留');
    } catch {
      useShell.getState().notify('缓存清理失败，请检查本机数据库后重试');
    } finally {
      setClearing(false);
    }
  };
  const windowContent = (
    <>
      <h2>
        <Monitor />
        窗口
      </h2>
      <Row label="窗口置顶" hint="始终显示在其他窗口上方">
        <Switch
          label="窗口置顶"
          checked={settings.alwaysOnTop}
          onChange={(value) => update('alwaysOnTop', value)}
          disabled={!desktopRuntime}
        />
      </Row>
      <Row label="记住窗口位置" hint="下次启动恢复上次位置">
        <Switch
          label="记住窗口位置"
          checked={settings.rememberPosition}
          onChange={(value) => update('rememberPosition', value)}
        />
      </Row>
      <Row label="窗口大小" hint="固定尺寸">
        <span className="small muted">960 × 600</span>
      </Row>
      <Row label="启动后打开首页">
        <Switch
          label="启动后打开首页"
          checked={settings.startHome}
          onChange={(value) => update('startHome', value)}
        />
      </Row>
      <Row label="关闭窗口时">
        <Select
          field="closeBehavior"
          label="关闭窗口时"
          choices={[
            { value: 'tray', label: '最小化到托盘' },
            { value: 'exit', label: '直接退出' },
          ]}
        />
      </Row>
      {desktopRuntime && !trayReady && (
        <p className="small muted">托盘不可用，关闭窗口将退出应用。</p>
      )}
    </>
  );
  return (
    <>
      <PageHeader
        title="设置"
        subtitle={
          <>
            {storageError ? '偏好保存失败' : '偏好自动保存'}
            <CircleCheck />
          </>
        }
      />
      <div className="settings-grid">
        <div className="settings-left">
          <Panel className="settings-section">
            <h2>
              <Palette />
              外观
            </h2>
            <Row label="主题模式">
              <div className="segmented">
                <button
                  className={settings.theme === 'light' ? 'active' : ''}
                  onClick={() => update('theme', 'light')}
                >
                  <Sun />
                  浅色
                </button>
                <button
                  className={settings.theme === 'dark' ? 'active' : ''}
                  onClick={() => update('theme', 'dark')}
                >
                  <Moon />
                  深色
                </button>
              </div>
            </Row>
            <RangeRow
              label="窗口不透明度"
              hint="数值越高，窗口底色越明显"
              value={settings.opacity}
              onChange={(value) => update('opacity', value)}
            />
            <RangeRow
              label="模糊强度"
              hint={
                !desktopRuntime
                  ? '请在桌面应用中调节'
                  : blurControl === 'pending'
                    ? '正在准备桌面模糊'
                    : blurControl === 'unavailable'
                      ? '当前系统无法调节模糊强度'
                      : '0% 最弱，100% 最强'
              }
              value={settings.blurStrength}
              onChange={(value) => update('blurStrength', value)}
              disabled={!desktopRuntime || blurControl !== 'ready'}
            />
            <Row label="玻璃材质">
              <span className="badge">
                <Layers />
                {material === 'unavailable' ? '系统材质不可用' : '始终开启'}
              </span>
            </Row>
            <div className="appearance-preview">
              {[
                { value: 20, label: '通透' },
                { value: 40, label: '平衡' },
                { value: 80, label: '柔和' },
              ].map((item) => (
                <button
                  className={settings.opacity === item.value ? 'active' : ''}
                  key={item.value}
                  aria-label={`${item.label}不透明度${item.value}%`}
                  onClick={() => update('opacity', item.value)}
                  style={{ '--preview-opacity': item.value / 100 } as React.CSSProperties}
                >
                  <div>
                    <strong>Aa 文字预览</strong>
                    <small>
                      {item.label} {item.value}%
                    </small>
                  </div>
                </button>
              ))}
            </div>
            {settings.theme === 'light' && windowContent}
          </Panel>
          {settings.theme === 'dark' && (
            <Panel className="settings-section settings-window">{windowContent}</Panel>
          )}
        </div>
        <div className="settings-right">
          <Panel className="settings-section">
            <h2>
              <Music2 />
              音乐
            </h2>
            <RangeRow
              label="默认音量"
              value={settings.volume}
              onChange={(value) => update('volume', value)}
            />
            <Row label="恢复上次播放">
              <Switch
                label="恢复上次播放"
                checked={settings.restoreMusic}
                onChange={(value) => update('restoreMusic', value)}
              />
            </Row>
          </Panel>
          <Panel className="settings-section">
            <h2>
              <BookOpen />
              阅读
            </h2>
            <Row label="默认模式">
              <Select
                field="readingMode"
                label="默认阅读模式"
                choices={[
                  { value: 'scroll', label: '滚动阅读' },
                  { value: 'page', label: '分页阅读' },
                ]}
              />
            </Row>
            <Row label="字体">
              <Select
                field="readingFont"
                label="默认字体"
                choices={(['宋体', '微软雅黑', '楷体'] as const).map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Row>
            <Row label="字号">
              <Select
                field="readingSize"
                label="默认字号"
                choices={[16, 18, 20, 22, 24, 26, 28].map((value) => ({
                  value,
                  label: `${value}px`,
                }))}
              />
            </Row>
            <Row label="行距">
              <Select
                field="readingLineHeight"
                label="默认行距"
                choices={[1.4, 1.6, 1.8, 2, 2.2, 2.4].map((value) => ({
                  value,
                  label: String(value),
                }))}
              />
            </Row>
            <Row label="默认主题">
              <Select
                field="readingTheme"
                label="默认阅读主题"
                choices={[
                  { value: 'follow', label: '跟随界面' },
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                ]}
              />
            </Row>
          </Panel>
          <Panel className="settings-section">
            <h2>
              <Database />
              缓存
            </h2>
            <Row label="缓存已用">
              <strong>
                {usage.state.status === 'ready'
                  ? `${(usage.state.data / 1024 / 1024).toFixed(1)} MB`
                  : '—'}
              </strong>
              <Button
                variant="primary"
                disabled={!cache || clearing}
                onClick={() => void clearCache()}
              >
                清理缓存
              </Button>
            </Row>
            <Row label="漫画缓存上限">
              <Select
                field="comicCacheLimitMB"
                label="漫画缓存上限"
                choices={[256, 512, 1024, 2048, 4096].map((value) => ({
                  value,
                  label: value < 1024 ? `${value} MB` : `${value / 1024} GB`,
                }))}
              />
            </Row>
            <Row label="保留内容">
              <small>书架、历史、进度与书签</small>
            </Row>
          </Panel>
        </div>
      </div>
    </>
  );
}
