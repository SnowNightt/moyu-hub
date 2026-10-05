import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import type { HttpClient } from './contracts';
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export function createTauriHttpClient(fetcher: typeof nativeFetch = nativeFetch): HttpClient {
  return {
    async request<T>(
      url: string,
      options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
    ): Promise<T> {
      const signal = options.signal ?? new AbortController().signal;
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        const controller = new AbortController();
        const abort = () => controller.abort(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => controller.abort(new Error('Steam 请求超时')), 12_000);
        try {
          const response = await fetcher(url, { method: 'GET', signal: controller.signal });
          if (!response.ok)
            throw new HttpError(
              response.status === 429
                ? `Steam 请求过于频繁，请稍后重试${response.headers.get('retry-after') ? `（服务端等待提示：${response.headers.get('retry-after')}）` : ''}`
                : `Steam 服务返回 ${response.status}`,
              response.status,
            );
          const body = await response.text();
          try {
            return JSON.parse(body) as T;
          } catch {
            throw new HttpError('Steam 响应格式错误', 200);
          }
        } catch (error) {
          signal.throwIfAborted();
          if (attempt || (error instanceof HttpError && ![502, 503, 504].includes(error.status)))
            throw error instanceof HttpError
              ? error
              : new Error('无法连接 Steam，请检查网络后重试');
        } finally {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
        }
        await delay(500, signal);
      }
    },
  };
}
