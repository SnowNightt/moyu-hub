/** Coalesce slider input; at most one native call is in flight and one value pending. */
export function latestTask<T>(run: (value: T) => Promise<void>, delay = 32) {
  let next: { value: T } | undefined;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  async function drain() {
    timer = undefined;
    running = true;
    try {
      while (next) {
        const value = next.value;
        next = undefined;
        await run(value);
      }
      const done = waiters;
      waiters = [];
      done.forEach(({ resolve }) => resolve());
    } catch (error) {
      next = undefined;
      const done = waiters;
      waiters = [];
      done.forEach(({ reject }) => reject(error));
    } finally {
      running = false;
    }
  }
  return (value: T) => {
    next = { value };
    const completion = new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
    if (!running && timer === undefined) timer = setTimeout(() => void drain(), delay);
    return completion;
  };
}
