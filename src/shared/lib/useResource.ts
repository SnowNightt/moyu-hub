import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './resource';
import type { Resource } from './resource';

/** Stable loaders supplied by a provider; request cancellation prevents stale updates. */
export function useResource<T>(load?: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Resource<T>>({ status: 'unconfigured' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!load) {
      setState({ status: 'unconfigured' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [load, revision]);
  return { state, retry };
}
