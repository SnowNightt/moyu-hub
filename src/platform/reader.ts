import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ReaderRepository } from '../features/reader/provider';
import type { ImportJob, ReadingProgress } from '../features/reader/model';
import { useSettings } from '../features/settings/store';

export function createReaderRepository(ensureDatabase: () => Promise<unknown>): ReaderRepository {
  let initialized: Promise<void> | undefined;
  let writes = Promise.resolve();
  let assetReads = Promise.resolve();
  let failure: unknown;
  const changes = new Set<() => void>();
  const jobs = new Set<(job: ImportJob) => void>();
  let latestJob: ImportJob | null = null;
  const ready = () =>
    (initialized ??= ensureDatabase()
      .then(() => invoke<void>('reader_api', { op: 'init', args: {} }))
      .catch((e) => {
        initialized = undefined;
        throw e;
      }));
  async function call<T>(op: string, args: unknown = {}, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (!['job', 'cancel', 'inspect'].includes(op)) await ready();
    const value = await invoke<T>('reader_api', { op, args });
    signal?.throwIfAborted();
    return value;
  }
  const onJob = (job: ImportJob | null) => {
    if (!job || (latestJob?.id === job.id && latestJob.revision > job.revision)) return;
    latestJob = job;
    jobs.forEach((fn) => fn(job));
  };
  const jobListener = listen<ImportJob>('reader-import', (event) => onJob(event.payload));
  void jobListener.catch(() => {});
  void listen('reader-changed', () => changes.forEach((fn) => fn())).catch(() => {});
  return {
    library: (signal) => call('library', {}, signal),
    item: (itemId, signal) => call('item', { itemId }, signal),
    chapters: (itemId, signal) => call('chapters', { itemId }, signal),
    resources: (itemId, signal) => call('resources', { itemId }, signal),
    content: (itemId, chapterId, chunk, signal) =>
      call('content', { itemId, chapterId, chunk }, signal),
    bookmarks: (itemId, signal) => call('bookmarks', { itemId }, signal),
    history: (signal) => call('history', {}, signal),
    progress: (itemId) => call('progress', { itemId }),
    resolveLink: (itemId, href) => call('resolveLink', { itemId, href }),
    async asset(itemId, resourceId, thumbnail, signal) {
      signal.throwIfAborted();
      await ready();
      const read = assetReads.then(() => {
        signal.throwIfAborted();
        return invoke<ArrayBuffer>('reader_asset', {
          itemId,
          resourceId,
          thumbnail,
          cacheLimitMb: useSettings.getState().settings.comicCacheLimitMB,
        });
      });
      assetReads = read.then(
        () => {},
        () => {},
      );
      const bytes = await read;
      signal.throwIfAborted();
      return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    },
    async select(directory) {
      return invoke('reader_select', { directory });
    },
    inspect: (selection, encoding) => call('inspect', { ...selection, encoding }),
    async startImport(requests) {
      await jobListener;
      const job = await call<ImportJob>('start', { requests });
      onJob(job);
      return latestJob!;
    },
    cancelImport: () => call('cancel'),
    async importJob() {
      const job = await call<ImportJob | null>('job');
      onJob(job);
      return latestJob;
    },
    subscribeImport(fn) {
      jobs.add(fn);
      if (latestJob) fn(latestJob);
      return () => {
        jobs.delete(fn);
      };
    },
    subscribe(fn) {
      changes.add(fn);
      return () => {
        changes.delete(fn);
      };
    },
    saveProgress(progress: ReadingProgress) {
      const next = writes
        .then(() => call<void>('saveProgress', progress))
        .then(() => {
          failure = undefined;
        });
      writes = next.catch((e) => {
        failure = e;
      });
      return next;
    },
    async flush() {
      await writes;
      if (failure) {
        const e = failure;
        failure = undefined;
        throw e;
      }
    },
    async removeFromLibrary(itemId) {
      await writes;
      return call('remove', { itemId });
    },
    relocate: (itemId, selection) => call('relocate', { itemId, ...selection }),
    async hideHistory(itemId) {
      await writes;
      return call('hideHistory', { itemId });
    },
    addBookmark: (progress, label) => call('addBookmark', { ...progress, label }),
    removeBookmark: (id) => call('removeBookmark', { id }),
    clearCache: () => call('clearCache'),
    cacheUsage: () => call('cacheUsage'),
  };
}
