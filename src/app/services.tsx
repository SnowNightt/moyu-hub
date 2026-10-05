import { createContext, useContext } from 'react';
import type { MusicProvider } from '../features/music/provider';
import type { SteamProvider } from '../features/steam/provider';
import type { HeyBoxProvider } from '../features/heybox/provider';
import type { ReaderRepository, OnlineReaderProvider } from '../features/reader/provider';
import type { HomeProvider } from '../features/home/provider';
import { createDatabaseConnection } from '../platform/database';
import { createTauriHttpClient } from '../platform/http';
import { createRemoteCache } from '../platform/remoteCache';
import { createSteamProvider } from '../features/steam/createSteamProvider';
import { createHomeProvider } from '../features/home/createHomeProvider';
import { desktopRuntime } from '../platform/runtime';
import { createReaderRepository } from '../platform/reader';
import { registerReaderRepository } from '../features/reader/lifecycle';
import type { FileGateway, HttpClient, CacheRepository } from '../platform/contracts';

/** Register real adapters here when a module is developed. Missing ≠ an empty fake feed. */
export type AppServices = {
  music?: MusicProvider;
  steam?: SteamProvider;
  heybox?: HeyBoxProvider;
  reader?: ReaderRepository;
  onlineReader?: OnlineReaderProvider;
  home?: HomeProvider;
  http?: HttpClient;
  files?: FileGateway;
  cache?: CacheRepository;
};
export const services: AppServices = {};
export async function createAppServices(): Promise<AppServices> {
  if (!desktopRuntime) return {};
  const database = createDatabaseConnection();
  // A failed connection is retried on later cache reads; online browsing still works.
  await database().catch(() => undefined);
  const http = createTauriHttpClient(),
    cache = createRemoteCache(database);
  const steam = createSteamProvider({ http, cache });
  const reader = createReaderRepository(database);
  registerReaderRepository(reader);
  return { http, cache, steam, reader, home: createHomeProvider({ steam, reader }) };
}
export const ServicesContext = createContext<AppServices>(services);
export function useServices() {
  return useContext(ServicesContext);
}
