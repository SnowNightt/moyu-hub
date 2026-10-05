import type { HttpClient } from '../../platform/contracts';
import { parseDetail, parseFeatured, parseSearch } from './parsers';
import { steamPageSize } from './provider';
export function steamUrl(path: string, params: Record<string, string> = {}) {
  return `https://store.steampowered.com${path}?${new URLSearchParams({ cc: 'cn', l: 'schinese', ...params })}`;
}
export function createSteamApi(http: HttpClient) {
  return {
    featured: async (signal: AbortSignal) =>
      parseFeatured(await http.request(steamUrl('/api/featuredcategories'), { signal })),
    detail: async (id: string, signal: AbortSignal) =>
      parseDetail(await http.request(steamUrl('/api/appdetails', { appids: id }), { signal }), id),
    search: async (params: Record<string, string>, page: number, signal: AbortSignal) =>
      parseSearch(
        await http.request(
          steamUrl('/search/results/', {
            category1: '998',
            infinite: '1',
            page: String(page),
            count: String(steamPageSize),
            ...params,
          }),
          { signal },
        ),
        page,
      ),
  };
}
