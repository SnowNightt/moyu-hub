/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRemoteCache } from './remoteCache';
import type { SqlDatabase } from './database';
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('src-tauri/migrations/0001_steam.sql', 'utf8'));
  const adapter: SqlDatabase = {
    async select<T>(sql: string, values = []) {
      const statement = db.prepare(sql);
      return (
        values.length
          ? statement.all(Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v])))
          : statement.all()
      ) as T;
    },
    async execute(sql: string, values = []) {
      const statement = db.prepare(sql);
      const result = values.length
        ? statement.run(Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v as SQLInputValue])))
        : statement.run();
      return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
    },
  };
  return { db, adapter };
}
describe('SQLite migration and cache', () => {
  it('disk cache survives service recreation, trims by bytes and clears', async () => {
    const { db, adapter } = database(),
      get = async () => adapter;
    const cache = createRemoteCache(get, 30);
    const entry = { payload: '中文缓存', fetchedAt: Date.now(), expiresAt: Date.now() + 10000 };
    expect(await cache.set('a', entry, cache.generation)).toBe(true);
    expect(await createRemoteCache(get).get('a')).toEqual(entry);
    await cache.set('b', entry, cache.generation);
    await cache.set('c', entry, cache.generation);
    expect(await cache.usageBytes()).toBeLessThanOrEqual(30);
    await cache.clearRemoteCache();
    expect(await cache.usageBytes()).toBe(0);
    db.close();
  });
  it('deletes damaged JSON', async () => {
    const { db, adapter } = database();
    db.exec("INSERT INTO remote_cache VALUES ('bad','{',1,0,1,1,1)");
    const cache = createRemoteCache(async () => adapter);
    expect(await cache.get('bad')).toBeUndefined();
    expect(await cache.usageBytes()).toBe(0);
    db.close();
  });
});
