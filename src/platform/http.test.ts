import { describe, expect, it, vi } from 'vitest';
import { createTauriHttpClient, delay } from './http';
describe('HTTP boundary', () => {
  it('never retries 429 or malformed JSON', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '60' } }));
    await expect(createTauriHttpClient(fetcher).request('https://example.test')).rejects.toThrow(
      '60',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(new Response('invalid'));
    await expect(createTauriHttpClient(fetcher).request('https://example.test')).rejects.toThrow(
      '格式',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('retries a transient 503 once', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValue(new Response('{"ok":true}'));
    expect(await createTauriHttpClient(fetcher).request('https://example.test')).toEqual({
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('cancels backoff promptly', async () => {
    const c = new AbortController();
    const promise = delay(10000, c.signal);
    c.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
