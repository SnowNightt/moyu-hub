import type { SteamData } from './provider';
export function SteamDataNotice({
  result,
  showUpdatedAt = true,
}: {
  result: SteamData<unknown>;
  showUpdatedAt?: boolean;
}) {
  if (!showUpdatedAt && !result.stale && !result.cacheWarning) return null;
  return (
    <p className={`small ${result.stale ? 'steam-cache-notice' : 'muted'}`} role="status">
      {result.stale ? `当前为缓存内容，刷新失败：${result.refreshError}。价格可能已变化。` : ''}
      {showUpdatedAt && <>更新于 {new Date(result.fetchedAt).toLocaleString('zh-CN')}</>}
      {result.cacheWarning && ` · ${result.cacheWarning}`}
    </p>
  );
}
