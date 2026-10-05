import type { SteamProvider } from '../steam/provider';
import type { HomeProvider } from './provider';
import type { ReaderRepository } from '../reader/provider';
export function createHomeProvider({
  steam,
  reader,
}: {
  steam: SteamProvider;
  reader?: ReaderRepository;
}): HomeProvider {
  return {
    getReading: reader
      ? async (signal) => {
          const [items, history] = await Promise.all([
            reader.library(signal),
            reader.history(signal),
          ]);
          return history
            .flatMap((progress) => {
              const item = items.find((i) => i.id === progress.itemId);
              return item ? [{ item, progress }] : [];
            })
            .slice(0, 2);
        }
      : undefined,
    async getSteamGames(signal, options) {
      const result = await steam.getFeatured(signal, options);
      const unique = new Map();
      for (const game of [...result.data.deals, ...result.data.featured])
        if (!unique.has(game.id)) unique.set(game.id, game);
      return { ...result, data: [...unique.values()].slice(0, 3) };
    },
  };
}
