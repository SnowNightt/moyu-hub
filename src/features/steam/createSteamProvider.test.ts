// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheKey, createSteamProvider } from './createSteamProvider';
import { createRemoteCache } from '../../platform/remoteCache';
import { parseFeatured } from './parsers';
import { createHomeProvider } from '../home/createHomeProvider';
import type { HttpClient } from '../../platform/contracts';
import fixture from './fixtures/featured.json';
import deals from './fixtures/deals.json';
import dealsPage2 from './fixtures/deals-page2.json';
import dealsAction from './fixtures/deals-action-page2.json';
import { gameGenres, genreTags } from './provider';
import { parseSearch } from './parsers';
const signal = () => new AbortController().signal;
const setup = () => {
  const request = vi.fn().mockResolvedValue(fixture);
  const cache = createRemoteCache();
  const steam = createSteamProvider({ http: { request } as HttpClient, cache });
  return { steam, cache, request };
};
afterEach(() => vi.useRealTimers());
describe('Steam shared cache', () => {
  it('shares initial home/featured requests and valid TTL', async () => {
    const { steam, request } = setup();
    const home = createHomeProvider({ steam });
    const [games] = await Promise.all([home.getSteamGames!(signal()), steam.getFeatured(signal())]);
    expect(games.data).toHaveLength(3);
    expect(new Set(games.data.map((g) => g.id)).size).toBe(3);
    await steam.getFeatured(signal());
    expect(request).toHaveBeenCalledTimes(1);
    await steam.getFeatured(signal(), { forceRefresh: true });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('returns old data with provenance but never after seven days', async () => {
    vi.useFakeTimers();
    const { steam, request } = setup();
    await steam.getFeatured(signal());
    vi.advanceTimersByTime(601_000);
    request.mockRejectedValue(new Error('offline'));
    const result = await steam.getFeatured(signal());
    expect(result.stale).toBe(true);
    expect(result.refreshError).toBe('offline');
    vi.advanceTimersByTime(7 * 86400_000);
    await expect(steam.getFeatured(signal())).rejects.toThrow('offline');
  });
  it('rejects corrupt cache and does not collide query keys', async () => {
    const { steam, cache, request } = setup();
    await cache.set(
      cacheKey('featured'),
      { payload: {}, fetchedAt: Date.now(), expiresAt: Date.now() + 60000 },
      cache.generation,
    );
    await steam.getFeatured(signal());
    expect(request).toHaveBeenCalledTimes(1);
    expect(cacheKey('search', 'a:b', 1, 20)).not.toBe(cacheKey('search', 'a', 'b', 1, 20));
    expect(cacheKey('featured')).toContain('cn');
  });
  it('one cancellation leaves the other consumer alive', async () => {
    const { steam, request } = setup();
    let release!: (v: unknown) => void;
    request.mockImplementation((_url: string, options: { signal: AbortSignal }) => {
      expect(options.signal.aborted).toBe(false);
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = new AbortController(),
      second = new AbortController();
    const a = steam.getFeatured(first.signal),
      b = steam.getFeatured(second.signal);
    const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(release).toBeDefined());
    first.abort();
    release(fixture);
    await rejected;
    expect((await b).data).toEqual(parseFeatured(fixture));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('all consumers cancel the underlying request; a new call starts cleanly', async () => {
    const { steam, request } = setup();
    let underlying!: AbortSignal;
    request.mockImplementationOnce((_url: string, options: { signal: AbortSignal }) => {
      underlying = options.signal;
      return new Promise((_resolve, reject) =>
        underlying.addEventListener('abort', () => reject(underlying.reason)),
      );
    });
    const c = new AbortController();
    const promise = steam.getFeatured(c.signal);
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(underlying).toBeDefined());
    c.abort();
    await rejected;
    expect(underlying.aborted).toBe(true);
    await steam.getFeatured(signal());
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('clearing prevents a pending request from repopulating cache', async () => {
    const { steam, request, cache } = setup();
    let release!: (v: unknown) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const promise = steam.getFeatured(signal());
    await vi.waitFor(() => expect(release).toBeDefined());
    await cache.clearRemoteCache();
    release(fixture);
    await promise;
    expect(await cache.get(cacheKey('featured'))).toBeUndefined();
  });
  it('does not request blank queries or invalid IDs', async () => {
    const { steam, request } = setup();
    await steam.searchGames('  ', Infinity, signal());
    await expect(steam.getGameDetail('../bad', signal())).rejects.toThrow('地址无效');
    expect(request).not.toHaveBeenCalled();
  });
  it('requests promotions with optional genre and true server pagination, in source order', async () => {
    const { steam, request } = setup();
    request.mockResolvedValue(deals);
    const first = await steam.getDeals('all', 1, signal());
    let url = new URL(request.mock.calls[0][0]);
    expect(url.searchParams.get('specials')).toBe('1');
    expect(url.searchParams.get('category1')).toBe('998');
    expect(url.searchParams.get('count')).toBe('25');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.has('tags')).toBe(false);
    expect(url.searchParams.has('sort_by')).toBe(false);
    expect(url.searchParams.has('start')).toBe(false);
    expect(first.data).toEqual(parseSearch(deals, 1));
    request.mockResolvedValue(dealsPage2);
    const second = await steam.getDeals('all', 2, signal());
    expect(new URL(request.mock.lastCall![0]).searchParams.get('page')).toBe('2');
    expect(second.data).toEqual(parseSearch(dealsPage2, 2));
    expect(second.data.items[0].id).not.toBe(first.data.items[0].id);
    request.mockResolvedValue(dealsAction);
    for (const genre of gameGenres) {
      await steam.getDeals(genre, 2, signal());
      url = new URL(request.mock.lastCall![0]);
      expect(url.searchParams.get('tags')).toBe(String(genreTags[genre]));
      expect(url.searchParams.get('specials')).toBe('1');
    }
    const calls = request.mock.calls.length;
    await steam.getDeals('all', 2, signal());
    expect(request).toHaveBeenCalledTimes(calls);
    request.mockResolvedValue(deals);
    await steam.getDeals('all', Infinity, signal(), { forceRefresh: true });
    expect(new URL(request.mock.lastCall![0]).searchParams.get('page')).toBe('1');
    request.mockResolvedValue(fixture);
    await steam.getFeatured(signal());
    expect(new URL(request.mock.lastCall![0]).pathname).toBe('/api/featuredcategories');
  });
});
