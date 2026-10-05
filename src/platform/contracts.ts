/** Reserved native boundaries. Implement and grant permissions only when a module is connected. */
export interface HttpClient {
  request<T>(
    url: string,
    options?: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal },
  ): Promise<T>;
}
export interface FileGateway {
  selectFiles(extensions: string[]): Promise<string[]>;
  selectDirectory(): Promise<string | null>;
  read(path: string): Promise<Uint8Array>;
}
export interface CacheRepository {
  usageBytes(): Promise<number>;
  clearRemoteCache(): Promise<void>;
}
