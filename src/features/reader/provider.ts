import type { PageResult } from '../../shared/lib/resource';
import type { LibraryItem, Chapter, ReadingProgress, Bookmark } from './model';
import type {
  ContentBlock,
  ReaderResource,
  ImportSelection,
  ImportRequest,
  ImportInspection,
  ImportJob,
} from './model';
export interface ReaderRepository {
  library(signal: AbortSignal): Promise<LibraryItem[]>;
  history(signal: AbortSignal): Promise<ReadingProgress[]>;
  chapters(itemId: string, signal: AbortSignal): Promise<Chapter[]>;
  bookmarks(itemId: string, signal: AbortSignal): Promise<Bookmark[]>;
  item(itemId: string, signal: AbortSignal): Promise<LibraryItem>;
  content(
    itemId: string,
    chapterId: string,
    chunk: number,
    signal: AbortSignal,
  ): Promise<ContentBlock[]>;
  resources(itemId: string, signal: AbortSignal): Promise<ReaderResource[]>;
  asset(
    itemId: string,
    resourceId: string,
    thumbnail: boolean,
    signal: AbortSignal,
  ): Promise<string>;
  progress(itemId: string): Promise<ReadingProgress | null>;
  resolveLink(itemId: string, href: string): Promise<Partial<ReadingProgress>>;
  saveProgress(progress: ReadingProgress): Promise<void>;
  removeFromLibrary(id: string): Promise<void>;
  select(directory: boolean): Promise<ImportSelection[]>;
  inspect(selection: ImportSelection, encoding?: string): Promise<ImportInspection>;
  startImport(requests: ImportRequest[]): Promise<ImportJob>;
  cancelImport(): Promise<void>;
  importJob(): Promise<ImportJob | null>;
  subscribeImport(listener: (job: ImportJob) => void): () => void;
  subscribe(listener: () => void): () => void;
  relocate(itemId: string, selection: ImportSelection): Promise<void>;
  hideHistory(itemId?: string): Promise<void>;
  addBookmark(progress: ReadingProgress, label: string): Promise<void>;
  removeBookmark(id: string): Promise<void>;
  flush(): Promise<void>;
  clearCache(): Promise<void>;
  cacheUsage(): Promise<number>;
}
export interface OnlineReaderProvider {
  search(
    query: string,
    type: 'all' | 'novel' | 'comic',
    page: number,
    signal: AbortSignal,
  ): Promise<PageResult<LibraryItem>>;
  detail(
    id: string,
    signal: AbortSignal,
  ): Promise<{ item: LibraryItem; summary: string; chapters: Chapter[] }>;
}
