import type { CacheRepository } from './contracts';
import type { SqlDatabase } from './database';
export type CacheEntry = { payload: unknown; fetchedAt: number; expiresAt: number };
type Row = { payload: string; fetched_at: number; expires_at: number; schema_version: number };
export interface RemoteCache extends CacheRepository {
  readonly generation: number;
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry, generation: number): Promise<boolean>;
  remove(key: string): Promise<void>;
}
export function createRemoteCache(
  database?: () => Promise<SqlDatabase>,
  budget = 20 * 1024 * 1024,
): RemoteCache {
  const memory = new Map<string, CacheEntry>();
  let generation = 0,
    queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(job: () => Promise<T>): Promise<T> => {
    const next = queue.then(job, job);
    queue = next.catch(() => {});
    return next;
  };
  const size = (entry: CacheEntry) =>
    new TextEncoder().encode(JSON.stringify(entry.payload)).length;
  const trim = () => {
    let bytes = [...memory.values()].reduce((n, e) => n + size(e), 0);
    for (const [key, entry] of memory) {
      if (bytes <= budget) break;
      memory.delete(key);
      bytes -= size(entry);
    }
  };
  return {
    get generation() {
      return generation;
    },
    async get(key) {
      const hit = memory.get(key);
      if (hit) {
        memory.delete(key);
        memory.set(key, hit);
        return hit;
      }
      const before = generation;
      try {
        const db = await database?.();
        if (!db) return;
        const [row] = await db.select<Row[]>(
          'SELECT payload, fetched_at, expires_at, schema_version FROM remote_cache WHERE cache_key = $1',
          [key],
        );
        if (!row) return;
        if (row.schema_version !== 1) {
          await this.remove(key);
          return;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(row.payload);
        } catch {
          await this.remove(key);
          return;
        }
        const entry = { payload, fetchedAt: row.fetched_at, expiresAt: row.expires_at };
        if (before !== generation) return;
        memory.set(key, entry);
        trim();
        void serialized(async () => {
          if (before === generation)
            await db.execute('UPDATE remote_cache SET last_accessed_at = $1 WHERE cache_key = $2', [
              Date.now(),
              key,
            ]);
        }).catch(() => {});
        return entry;
      } catch {
        return;
      }
    },
    async set(key, entry, expected) {
      if (expected !== generation) return true;
      memory.delete(key);
      memory.set(key, entry);
      trim();
      return serialized(async () => {
        if (expected !== generation) return true;
        try {
          const db = await database?.();
          if (!db) return false;
          if (expected !== generation) return true;
          await db.execute(
            'INSERT INTO remote_cache (cache_key,payload,schema_version,fetched_at,expires_at,last_accessed_at,size_bytes) VALUES ($1,$2,1,$3,$4,$5,$6) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,schema_version=1,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,last_accessed_at=excluded.last_accessed_at,size_bytes=excluded.size_bytes',
            [
              key,
              JSON.stringify(entry.payload),
              entry.fetchedAt,
              entry.expiresAt,
              Date.now(),
              size(entry),
            ],
          );
          const rows = await db.select<{ cache_key: string; size_bytes: number }[]>(
            'SELECT cache_key,size_bytes FROM remote_cache ORDER BY last_accessed_at DESC',
          );
          let bytes = 0;
          for (const row of rows) {
            bytes += row.size_bytes;
            if (bytes > budget)
              await db.execute('DELETE FROM remote_cache WHERE cache_key=$1', [row.cache_key]);
          }
          return true;
        } catch {
          return false;
        }
      });
    },
    async remove(key) {
      memory.delete(key);
      await serialized(async () => {
        const db = await database?.();
        await db?.execute('DELETE FROM remote_cache WHERE cache_key=$1', [key]);
      }).catch(() => {});
    },
    async usageBytes() {
      const db = await database?.();
      if (!db) return [...memory.values()].reduce((n, e) => n + size(e), 0);
      const [row] = await db.select<{ bytes: number }[]>(
        'SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM remote_cache',
      );
      return row.bytes;
    },
    async clearRemoteCache() {
      generation++;
      memory.clear();
      await serialized(async () => {
        const db = await database?.();
        await db?.execute('DELETE FROM remote_cache');
      });
    },
  };
}
