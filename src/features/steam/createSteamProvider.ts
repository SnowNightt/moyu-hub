import type { HttpClient } from '../../platform/contracts';
import type { RemoteCache } from '../../platform/remoteCache';
import { createSteamApi } from './api';
import { isDetail, isFeatured, isPage } from './parsers';
import { genreTags, normalizePage, steamPageSize, validAppId } from './provider';
import type { SteamData, SteamProvider, SteamRequestOptions } from './provider';
export const cacheKey = (...parts: (string | number)[]) =>
  JSON.stringify(['steam', 'v1', 'cn', 'schinese', ...parts]);
type Flight = {
  controller: AbortController;
  promise: Promise<SteamData<unknown>>;
  consumers: number;
};
export function createSteamProvider({
  http,
  cache,
}: {
  http: HttpClient;
  cache: RemoteCache;
}): SteamProvider {
  const api = createSteamApi(http),
    flights = new Map<string, Flight>();
  function request<T>(
    key: string,
    ttl: number,
    load: (signal: AbortSignal) => Promise<T>,
    valid: (v: unknown) => v is T,
    signal: AbortSignal,
    options?: SteamRequestOptions,
  ): Promise<SteamData<T>> {
    signal.throwIfAborted();
    let flight = flights.get(key);
    if (!flight) {
      const controller = new AbortController(),
        generation = cache.generation;
      const promise = (async (): Promise<SteamData<T>> => {
        let old = await cache.get(key);
        controller.signal.throwIfAborted();
        const now = Date.now();
        if (
          old &&
          (!valid(old.payload) ||
            !Number.isFinite(old.fetchedAt) ||
            !Number.isFinite(old.expiresAt) ||
            old.fetchedAt > now ||
            old.expiresAt < old.fetchedAt ||
            old.expiresAt - old.fetchedAt > ttl ||
            now - old.fetchedAt > 7 * 86400_000)
        ) {
          await cache.remove(key);
          old = undefined;
        }
        if (old && old.expiresAt > now && !options?.forceRefresh)
          return {
            data: old.payload as T,
            fetchedAt: new Date(old.fetchedAt).toISOString(),
            stale: false,
          };
        try {
          const data = await load(controller.signal);
          controller.signal.throwIfAborted();
          const fetchedAt = Date.now();
          const saved = await cache.set(
            key,
            { payload: data, fetchedAt, expiresAt: fetchedAt + ttl },
            generation,
          );
          return {
            data,
            fetchedAt: new Date(fetchedAt).toISOString(),
            stale: false,
            ...(!saved ? { cacheWarning: '本次内容无法保存为离线数据' } : {}),
          };
        } catch (error) {
          controller.signal.throwIfAborted();
          if (old)
            return {
              data: old.payload as T,
              fetchedAt: new Date(old.fetchedAt).toISOString(),
              stale: true,
              refreshError: error instanceof Error ? error.message : '刷新失败',
            };
          throw error;
        }
      })();
      flight = { controller, promise, consumers: 0 };
      flights.set(key, flight);
      const current = flight;
      void promise
        .finally(() => {
          if (flights.get(key) === current) flights.delete(key);
        })
        .catch(() => {});
    }
    const current = flight;
    current.consumers++;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return false;
        done = true;
        signal.removeEventListener('abort', cancel);
        current.consumers--;
        return true;
      };
      const cancel = () => {
        if (!finish()) return;
        reject(signal.reason);
        if (!current.consumers) {
          if (flights.get(key) === current) flights.delete(key);
          current.controller.abort();
        }
      };
      signal.addEventListener('abort', cancel, { once: true });
      current.promise.then(
        (result) => {
          if (finish()) resolve(result as SteamData<T>);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    });
  }
  const provider: SteamProvider = {
    getFeatured: (signal, options) =>
      request(cacheKey('featured'), 600_000, api.featured, isFeatured, signal, options),
    getDeals(genre, page, signal, options) {
      page = normalizePage(page);
      if (genre !== 'all' && !genreTags[genre]) throw new Error('无效游戏类型');
      const params: Record<string, string> = { specials: '1' };
      if (genre !== 'all') params.tags = String(genreTags[genre]);
      return request(
        cacheKey('deals', genre === 'all' ? 'all' : genreTags[genre], page, steamPageSize),
        180_000,
        (s) => api.search(params, page, s),
        isPage,
        signal,
        options,
      );
    },
    browseGamesByGenre(genre, page, signal, options) {
      page = normalizePage(page);
      if (!genreTags[genre]) throw new Error('无效游戏类型');
      return request(
        cacheKey('genre', genreTags[genre], page, steamPageSize),
        180_000,
        (s) => api.search({ tags: String(genreTags[genre]) }, page, s),
        isPage,
        signal,
        options,
      );
    },
    searchGames(query, page, signal, options) {
      query = query.trim();
      page = normalizePage(page);
      if (!query) {
        signal.throwIfAborted();
        return Promise.resolve({
          data: { items: [], total: 0, page: 1, pageSize: steamPageSize },
          fetchedAt: new Date().toISOString(),
          stale: false,
        });
      }
      return request(
        cacheKey('search', query, page, steamPageSize),
        180_000,
        (s) => api.search({ term: query }, page, s),
        isPage,
        signal,
        options,
      );
    },
    getGameDetail(id, signal, options) {
      if (!validAppId(id)) return Promise.reject(new Error('游戏地址无效'));
      return request(
        cacheKey('detail', id),
        600_000,
        (s) => api.detail(id, s),
        (v): v is import('./provider').GameDetail => isDetail(v) && v.id === id,
        signal,
        options,
      );
    },
  };
  return provider;
}
