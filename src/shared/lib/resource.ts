/** An unavailable integration is distinct from an empty successful response. */
export type Resource<T> =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}
