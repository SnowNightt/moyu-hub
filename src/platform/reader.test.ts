import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name, fn) => {
    mocks.handlers.set(name, fn);
    return () => {};
  }),
}));
vi.mock('../features/settings/store', () => ({
  useSettings: { getState: () => ({ settings: { comicCacheLimitMB: 256 } }) },
}));
import { createReaderRepository } from './reader';

describe('native reader repository', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.handlers.clear();
  });
  it('does not let an older import snapshot overwrite a newer event', async () => {
    mocks.invoke.mockImplementation(async (_command, { op }) => {
      if (op === 'start') {
        mocks.handlers.get('reader-import')!({
          payload: { id: 'job', revision: 4, status: 'finished', entries: [] },
        });
        return { id: 'job', revision: 0, status: 'running', entries: [] };
      }
    });
    const reader = createReaderRepository(async () => {});
    expect(
      (
        await reader.startImport([
          { sourceToken: 'token', displayName: 'book', format: 'TXT', storageMode: 'reference' },
        ])
      ).status,
    ).toBe('finished');
  });
  it('serializes position writes and surfaces failed persistence', async () => {
    let writes = 0;
    const order: number[] = [];
    mocks.invoke.mockImplementation(async (_command, { op, args }) => {
      if (op === 'saveProgress') {
        order.push(args.position);
        if (++writes === 1) throw new Error('disk failed');
      }
    });
    const reader = createReaderRepository(async () => {});
    const progress = {
      itemId: 'book',
      chapterId: 'c0',
      position: 0.2,
      completion: 0.2,
      updatedAt: 0,
    };
    await expect(reader.saveProgress(progress)).rejects.toThrow('disk failed');
    await expect(reader.flush()).rejects.toThrow('disk failed');
    await reader.saveProgress({ ...progress, position: 0.4 });
    await expect(reader.flush()).resolves.toBeUndefined();
    expect(order).toEqual([0.2, 0.4]);
  });
  it('ignores cancelled content responses and retries failed initialization', async () => {
    const ensure = vi
      .fn()
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValue(undefined);
    mocks.invoke.mockResolvedValue([]);
    const reader = createReaderRepository(ensure);
    await expect(reader.library(new AbortController().signal)).rejects.toThrow('db unavailable');
    await expect(reader.library(new AbortController().signal)).resolves.toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(reader.content('b', 'c0', 0, controller.signal)).rejects.toThrow();
    expect(ensure).toHaveBeenCalledTimes(2);
  });
});
