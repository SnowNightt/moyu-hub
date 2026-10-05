import type { PageResult } from '../../shared/lib/resource';
export const gameGenres = [
  '动作',
  '冒险',
  '角色扮演',
  '策略',
  '模拟',
  '独立',
  '体育',
  '竞速',
] as const;
export type GameGenre = (typeof gameGenres)[number];
export type DealGenre = GameGenre | 'all';
// Steam's infinite search uses page=N and returns 25 source rows per page.
export const steamPageSize = 25;
// Verified against Steam's Chinese search filter on 2026-10-03.
export const genreTags: Record<GameGenre, number> = {
  动作: 19,
  冒险: 21,
  角色扮演: 122,
  策略: 9,
  模拟: 599,
  独立: 492,
  体育: 701,
  竞速: 699,
};
export type GamePrice =
  | { kind: 'free' }
  | { kind: 'unavailable' }
  | {
      kind: 'paid';
      currency: string;
      currentMinor: number;
      originalMinor?: number;
      discountPercent?: number;
    };
export type Game = {
  id: string;
  title: string;
  cover?: string;
  genres: string[];
  platforms: string[];
  releaseDate?: string;
  comingSoon?: boolean;
  price: GamePrice;
};
export type GameDetail = Game & {
  summary: string;
  description: string;
  screenshots: string[];
  developers: string[];
  publishers: string[];
};
export type SteamData<T> = {
  data: T;
  fetchedAt: string;
  stale: boolean;
  refreshError?: string;
  cacheWarning?: string;
};
export type SteamRequestOptions = { forceRefresh?: boolean };
export type FeaturedGames = { featured: Game[]; deals: Game[]; popular: Game[] };
export interface SteamProvider {
  getFeatured(
    signal: AbortSignal,
    options?: SteamRequestOptions,
  ): Promise<SteamData<FeaturedGames>>;
  getDeals(
    genre: DealGenre,
    page: number,
    signal: AbortSignal,
    options?: SteamRequestOptions,
  ): Promise<SteamData<PageResult<Game>>>;
  browseGamesByGenre(
    genre: GameGenre,
    page: number,
    signal: AbortSignal,
    options?: SteamRequestOptions,
  ): Promise<SteamData<PageResult<Game>>>;
  searchGames(
    query: string,
    page: number,
    signal: AbortSignal,
    options?: SteamRequestOptions,
  ): Promise<SteamData<PageResult<Game>>>;
  getGameDetail(
    id: string,
    signal: AbortSignal,
    options?: SteamRequestOptions,
  ): Promise<SteamData<GameDetail>>;
}
export const validAppId = (id: string) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
export const normalizePage = (page: number) =>
  Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(page * steamPageSize) ? page : 1;
