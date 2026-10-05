const flushers = new Set<() => Promise<void>>();
export function registerReaderFlush(flush: () => Promise<void>) {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}
export async function flushReaderSessions() {
  await Promise.all([...flushers].map((flush) => flush()));
  await repository?.flush();
}
import type { ReaderRepository } from './provider';
let repository: ReaderRepository | undefined;
export function registerReaderRepository(reader: ReaderRepository) {
  repository = reader;
}
export async function finishReaderImports() {
  if (!repository) return;
  const job = await repository.importJob();
  if (job?.status !== 'running') return;
  await repository.cancelImport();
  const deadline = Date.now() + 30_000;
  while ((await repository.importJob())?.status === 'running') {
    if (Date.now() > deadline) throw new Error('正在结束导入，请稍后再次退出。');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
