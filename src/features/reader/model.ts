export type LibraryItem = {
  id: string;
  sourceId: string;
  source: 'local' | 'online';
  type: 'novel' | 'comic';
  title: string;
  author?: string;
  cover?: string;
  format: 'TXT' | 'EPUB' | 'CBZ' | 'folder' | 'online';
  coverResourceId?: string;
  storageMode?: 'reference' | 'copy';
  warnings?: string[];
  availability?: 'ready' | 'missing' | 'changed';
  progress?: ReadingProgress;
};
export type Chapter = {
  id: string;
  title: string;
  index: number;
  units?: number;
  chunks?: number;
  pages?: string[];
  target?: string;
  navigation?: { title: string; href: string }[];
};
export type ReadingProgress = {
  itemId: string;
  chapterId: string;
  chapterTitle?: string;
  position: number;
  page?: number;
  updatedAt: string | number;
  completion?: number;
  chunk?: number;
  blockId?: string;
  offset?: number;
  mode?: 'single' | 'continuous';
  zoom?: number;
};
export type Bookmark = {
  id: string;
  itemId: string;
  chapterId: string;
  position: number;
  label: string;
  chunk?: number;
  blockId?: string;
  offset?: number;
  completion?: number;
};
export type ContentBlock = {
  id: string;
  kind: 'heading' | 'paragraph' | 'image' | 'anchor';
  text: string;
  resourceId?: string;
  anchor?: string;
  runs?: { text: string; strong: boolean; emphasis: boolean; href?: string }[];
};
export type ReaderResource = { id: string; width: number; height: number; error?: string };
export type ImportSelection = { sourceToken: string; displayName: string; format: string };
export type ImportRequest = ImportSelection & {
  storageMode: 'reference' | 'copy';
  title?: string;
  encoding?: string;
};
export type ImportInspection = {
  sizeBytes?: number;
  pageCount?: number;
  pagePreview?: string[];
  format: string;
  type: 'novel' | 'comic';
  encoding?: string;
  preview?: string;
  suspect?: boolean;
};
export type ImportEntry = {
  request?: ImportRequest;
  entryId: number;
  name: string;
  status: string;
  message?: string;
  itemId?: string;
};
export type ImportJob = {
  id: string;
  revision: number;
  status: 'running' | 'finished';
  entries: ImportEntry[];
};
