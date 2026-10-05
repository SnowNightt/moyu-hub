import { afterEach, describe, expect, it, vi } from 'vitest';
import { latestTask } from './latestTask';

afterEach(() => vi.useRealTimers());
describe('native appearance scheduling', () => {
  it('coalesces rapid input and never overlaps native calls', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            release = r;
          }),
      )
      .mockResolvedValue(undefined);
    const apply = latestTask<number>(run);
    const first = apply(10);
    const second = apply(20);
    await vi.advanceTimersByTimeAsync(32);
    expect(run.mock.calls).toEqual([[20]]);
    const third = apply(30);
    const last = apply(90);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second, third, last]);
    expect(run.mock.calls).toEqual([[20], [90]]);
  });
  it('reports failure to callers and allows a later retry', async () => {
    vi.useFakeTimers();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('device lost'))
      .mockResolvedValue(undefined);
    const apply = latestTask<number>(run);
    const failed = expect(apply(40)).rejects.toThrow('device lost');
    await vi.advanceTimersByTimeAsync(32);
    await failed;
    const retry = apply(50);
    await vi.advanceTimersByTimeAsync(32);
    await retry;
    expect(run).toHaveBeenCalledTimes(2);
  });
});
