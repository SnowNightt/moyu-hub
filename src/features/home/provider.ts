import type { Game, SteamData, SteamRequestOptions } from '../steam/provider';
import type { Post } from '../heybox/provider';
import type { LibraryItem, ReadingProgress } from '../reader/model';
export interface HomeProvider {
  getSteamGames?: (
    signal: AbortSignal,
    options?: SteamRequestOptions,
  ) => Promise<SteamData<Game[]>>;
  getReading?: (signal: AbortSignal) => Promise<{ item: LibraryItem; progress: ReadingProgress }[]>;
  getPosts?: (signal: AbortSignal) => Promise<Post[]>;
}
