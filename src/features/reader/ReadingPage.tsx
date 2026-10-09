import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  List,
  Palette,
  Type,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Slider } from '../../shared/ui';
import { useServices } from '../../app/services';
import { useSettings } from '../settings/store';
import { useShell } from '../../app/shellStore';
import { registerReaderFlush } from './lifecycle';
import { ReaderImage } from './ReaderImage';
import type {
  Bookmark,
  Chapter,
  ContentBlock,
  LibraryItem,
  ReaderResource,
  ReadingProgress,
} from './model';
import { captureTextAnchor, restoreTextAnchor, completion } from './position';

export function ReadingPage({ comic = false }: { comic?: boolean }) {
  const { itemId } = useParams();
  return <ReadingSession key={itemId ?? 'empty'} itemId={itemId} comic={comic} />;
}
function ReadingSession({ itemId, comic }: { itemId?: string; comic: boolean }) {
  const { reader } = useServices();
  const { settings, update } = useSettings();
  const [item, setItem] = useState<LibraryItem>();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [resources, setResources] = useState<ReaderResource[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chunk, setChunk] = useState(0);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [page, setPage] = useState(0);
  const [visiblePage, setVisiblePage] = useState(0);
  const [mode, setMode] = useState<'single' | 'continuous'>('single');
  const [zoom, setZoom] = useState(90);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [bootstrapRevision, setBootstrapRevision] = useState(0);
  const [directory, setDirectory] = useState(true);
  const [typeset, setTypeset] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [percent, setPercent] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 600, height: 400 });
  const latest = useRef<ReadingProgress | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoring = useRef(true);
  const pending = useRef<ReadingProgress | null>(null);
  const session = useRef(true);
  const chapter = chapters[chapterIndex];
  const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const currentImage = resourceMap.get(chapter?.pages?.[page] ?? '');
  const fittedWidth =
    (Math.max(
      80,
      Math.min(
        viewport.width - 48,
        ((viewport.height - 80) * (currentImage?.width ?? 800)) / (currentImage?.height ?? 1200),
      ),
    ) *
      zoom) /
    90;
  const theme = settings.readingTheme === 'follow' ? settings.theme : settings.readingTheme;
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const resize = new ResizeObserver(() =>
      setViewport((previous) =>
        previous.width === el.clientWidth && previous.height === el.clientHeight
          ? previous
          : { width: el.clientWidth, height: el.clientHeight },
      ),
    );
    resize.observe(el);
    return () => resize.disconnect();
  }, [ready]);
  const report = (e: unknown) => {
    if (session.current) setError(String(e));
    else useShell.getState().notify(`阅读位置保存失败：${String(e)}`);
  };
  async function flush() {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (dirty.current && latest.current && reader) {
      const value = latest.current;
      dirty.current = false;
      try {
        await reader.saveProgress(value);
      } catch (e) {
        dirty.current = true;
        report(e);
        throw e;
      }
    }
    await reader?.flush();
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    session.current = true;
    const off = registerReaderFlush(() => flushRef.current());
    return () => {
      session.current = false;
      off();
      void flushRef.current().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!reader || !itemId) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    void Promise.all([
      reader.item(itemId, c.signal),
      reader.chapters(itemId, c.signal),
      reader.progress(itemId),
      reader.resources(itemId, c.signal),
      reader.bookmarks(itemId, c.signal),
    ])
      .then(([item, chapters, progress, resources, bookmarks]) => {
        if (c.signal.aborted) return;
        if ((item.type === 'comic') !== comic)
          throw new Error('作品类型与阅读页面不匹配，请返回书架打开。');
        setItem(item);
        setChapters(chapters);
        setResources(resources);
        setBookmarks(bookmarks);
        const index = Math.max(
          0,
          chapters.findIndex((ch) => ch.id === progress?.chapterId),
        );
        setChapterIndex(index);
        setChunk(progress?.chunk ?? 0);
        setPage(progress?.page ?? 0);
        setVisiblePage(progress?.page ?? 0);
        if (progress?.mode) setMode(progress.mode);
        if (progress?.zoom) setZoom(progress.zoom);
        pending.current = progress;
        latest.current = progress;
        setPercent(Math.round((progress?.completion ?? 0) * 100));
        setReady(true);
      })
      .catch((e) => {
        if (!c.signal.aborted) report(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [reader, itemId, comic, bootstrapRevision]);
  useEffect(() => {
    if (!ready || !reader || !itemId || !chapter || comic) return;
    const c = new AbortController();
    restoring.current = true;
    setBlocks([]);
    setLoading(true);
    setError('');
    void reader
      .content(itemId, chapter.id, chunk, c.signal)
      .then(setBlocks)
      .catch((e) => {
        if (!c.signal.aborted) report(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [reader, ready, itemId, chapter, chunk, comic, revision]);
  useLayoutEffect(() => {
    if (!ready || loading || !stage.current) return;
    restoring.current = true;
    const target = pending.current;
    const restore = () => {
      const el = stage.current;
      if (!el) return;
      if (comic) {
        const node = el.querySelector<HTMLElement>(`[data-page="${target?.page ?? page}"]`);
        el.scrollTop =
          mode === 'continuous' && node
            ? node.offsetTop + (target?.position ?? 0) * node.offsetHeight
            : (target?.position ?? 0) * Math.max(0, el.scrollHeight - el.clientHeight);
      } else {
        restoreTextAnchor(el, target);
      }
    };
    restore();
    let second = 0;
    const first = requestAnimationFrame(() => {
      restore();
      second = requestAnimationFrame(() => {
        restoring.current = false;
        pending.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [
    ready,
    loading,
    blocks,
    chapterIndex,
    chunk,
    comic,
    page,
    mode,
    zoom,
    settings.readingSize,
    settings.readingLineHeight,
    settings.readingWidth,
    settings.readingFont,
    directory,
    typeset,
    revision,
  ]);
  function record(explicitPage?: number) {
    if (!reader || !itemId || !chapter || !stage.current || loading || restoring.current) return;
    const el = stage.current;
    let selectedPage = explicitPage ?? page;
    let position = 0;
    let anchor: { blockId?: string; offset?: number } = {};
    if (comic) {
      if (mode === 'single')
        position = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      if (mode === 'continuous' && explicitPage === undefined) {
        const top = el.getBoundingClientRect().top;
        const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-page]'));
        const node = nodes.find((n) => n.getBoundingClientRect().bottom > top + 5);
        if (node) {
          selectedPage = Number(node.dataset.page);
          setVisiblePage(selectedPage);
          position = Math.max(
            0,
            Math.min(1, (top - node.getBoundingClientRect().top) / node.offsetHeight),
          );
        }
        // The scroll position is already correct; do not trigger restoration on a page counter update.
      }
    } else {
      anchor = captureTextAnchor(el);
      position =
        el.scrollHeight <= el.clientHeight + 1
          ? 1
          : el.scrollTop / (el.scrollHeight - el.clientHeight);
    }
    const progress: ReadingProgress = {
      itemId,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      position,
      page: selectedPage,
      chunk,
      ...anchor,
      updatedAt: Date.now(),
      mode,
      zoom,
      completion: completion(
        chapters,
        chapterIndex,
        comic
          ? (selectedPage + (mode === 'single' ? 1 : position)) /
              Math.max(1, chapter.pages?.length ?? 1)
          : (chunk + position) / Math.max(1, chapter.chunks ?? 1),
      ),
    };
    latest.current = progress;
    dirty.current = true;
    setPercent(Math.round(progress.completion! * 100));
    if (!timer.current)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void flushRef.current().catch(() => {});
      }, 800);
  }
  function changeChapter(index: number, target?: Partial<ReadingProgress>) {
    if (index < 0 || index >= chapters.length) return;
    void flush().catch(() => {});
    restoring.current = true;
    pending.current = {
      itemId: itemId!,
      chapterId: chapters[index].id,
      position: 0,
      updatedAt: Date.now(),
      ...target,
    };
    setChapterIndex(index);
    setChunk(target?.chunk ?? 0);
    setPage(target?.page ?? 0);
    setVisiblePage(target?.page ?? 0);
    if (index === chapterIndex && (target?.chunk ?? 0) === chunk) setRevision((v) => v + 1);
  }
  function turn(direction: number) {
    const el = stage.current;
    if (!el || !chapter) return;
    if (comic) {
      const current = mode === 'continuous' ? (latest.current?.page ?? page) : page;
      const next = current + direction;
      if (next < 0) {
        changeChapter(chapterIndex - 1, {
          page: Math.max(0, (chapters[chapterIndex - 1]?.pages?.length ?? 1) - 1),
        });
        return;
      }
      if (next >= (chapter.pages?.length ?? 0)) {
        changeChapter(chapterIndex + 1);
        return;
      }
      void flush().catch(() => {});
      pending.current = null;
      setPage(next);
      setVisiblePage(next);
      // Save explicit navigation after layout restoration completes.
    } else {
      const next = el.scrollTop + direction * Math.max(1, el.clientHeight - 24);
      if (direction > 0 && el.scrollTop >= el.scrollHeight - el.clientHeight - 2) {
        if (chunk + 1 < (chapter.chunks ?? 1)) {
          void flush().catch(() => {});
          pending.current = null;
          setChunk((v) => v + 1);
        } else changeChapter(chapterIndex + 1);
      } else if (direction < 0 && el.scrollTop <= 1) {
        if (chunk > 0) {
          void flush().catch(() => {});
          pending.current = {
            itemId: itemId!,
            chapterId: chapter.id,
            chunk: chunk - 1,
            position: 1,
            updatedAt: Date.now(),
          };
          setChunk((v) => v - 1);
        } else
          changeChapter(chapterIndex - 1, {
            chunk: Math.max(0, (chapters[chapterIndex - 1]?.chunks ?? 1) - 1),
            position: 1,
          });
      } else {
        el.scrollTop = Math.max(0, next);
        record();
      }
    }
  }
  function keepAnchor() {
    pending.current =
      latest.current ??
      (stage.current
        ? {
            itemId: itemId!,
            chapterId: chapter?.id ?? '',
            position: 0,
            updatedAt: Date.now(),
            ...captureTextAnchor(stage.current),
          }
        : null);
  }
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => {
    if (!ready || loading || error) return;
    const timeout = setTimeout(() => recordRef.current(), 250);
    return () => clearTimeout(timeout);
  }, [ready, loading, error, chapterIndex, chunk, page, mode, zoom]);
  async function bookmark() {
    if (!reader || !itemId || !chapter) return;
    record();
    const current = latest.current ?? {
      itemId,
      chapterId: chapter.id,
      chunk,
      position: 0,
      completion: 0,
      updatedAt: Date.now(),
    };
    try {
      await reader.addBookmark(current, `${chapter.title} · ${percent}%`);
      setBookmarks(await reader.bookmarks(itemId, new AbortController().signal));
    } catch (e) {
      report(e);
    }
  }
  async function followLink(href: string) {
    try {
      const target = await reader!.resolveLink(itemId!, href);
      changeChapter(
        chapters.findIndex((c) => c.id === target.chapterId),
        target,
      );
    } catch (e) {
      report(e);
    }
  }
  function textContent(block: ContentBlock) {
    return block.runs?.length
      ? block.runs.map((run, index) => {
          let node = <span>{run.text}</span>;
          if (run.strong) node = <strong>{node}</strong>;
          if (run.emphasis) node = <em>{node}</em>;
          return run.href ? (
            <button
              className="reader-inline-link"
              key={index}
              onClick={() => void followLink(run.href!)}
            >
              {node}
            </button>
          ) : (
            <span key={index}>{node}</span>
          );
        })
      : block.text;
  }
  return (
    <div className={`reader-session reader-theme-${theme}`}>
      <div className="reader-toolbar">
        <Link
          className="ui-button-secondary"
          to="/reader"
          onClick={() => {
            void flush().catch(() => {});
          }}
        >
          <ChevronLeft />
          返回书架
        </Link>
        <strong className="reader-title">{item?.title ?? '尚未选择作品'}</strong>
        <div className="reader-tools">
          <Button
            variant="text"
            onClick={() => {
              keepAnchor();
              setDirectory((v) => !v);
            }}
          >
            <List />
            目录
          </Button>
          {!comic && (
            <>
              <Button variant="text" disabled={!ready || loading} onClick={() => void bookmark()}>
                <BookmarkIcon />
                书签
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  keepAnchor();
                  setTypeset((v) => !v);
                }}
              >
                <Type />
                排版
              </Button>
            </>
          )}
          <Button
            variant="text"
            onClick={() => update('readingTheme', theme === 'dark' ? 'light' : 'dark')}
          >
            <Palette />
          </Button>
        </div>
      </div>
      {error && (
        <div className="reader-error" role="alert">
          {error}{' '}
          <Button
            onClick={() => {
              setError('');
              if (ready) setRevision((v) => v + 1);
              else setBootstrapRevision((v) => v + 1);
            }}
          >
            重试
          </Button>
        </div>
      )}
      {!reader || !itemId ? (
        <EmptyState title="尚未选择作品" description="请从书架导入并打开作品。" icon={BookOpen} />
      ) : (
        <>
          <div className="reader-layout">
            {directory && (
              <aside className="ui-glass reader-chapter-pane">
                <div className="ui-row">
                  <Button variant="text" onClick={() => setShowBookmarks(false)}>
                    目录
                  </Button>
                  {!comic && (
                    <Button variant="text" onClick={() => setShowBookmarks(true)}>
                      书签
                    </Button>
                  )}
                </div>
                {showBookmarks ? (
                  bookmarks.length ? (
                    bookmarks.map((b) => (
                      <div key={b.id} className="reader-bookmark">
                        <button
                          onClick={() =>
                            changeChapter(
                              chapters.findIndex((c) => c.id === b.chapterId),
                              b,
                            )
                          }
                        >
                          {b.label}
                        </button>
                        <button
                          aria-label={`删除书签 ${b.label}`}
                          onClick={() =>
                            void reader
                              .removeBookmark(b.id)
                              .then(() => setBookmarks((v) => v.filter((x) => x.id !== b.id)))
                              .catch(report)
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="ui-muted">暂无书签</p>
                  )
                ) : (
                  chapters.map((c, i) => (
                    <div key={c.id}>
                      <button
                        className={`reader-chapter-row ${i === chapterIndex ? 'ui-active' : ''}`}
                        onClick={() => changeChapter(i)}
                      >
                        <span>{c.title}</span>
                      </button>
                      {c.navigation
                        ?.filter((n) => n.href.includes('#'))
                        .map((n, index) => (
                          <button
                            className="reader-chapter-row reader-subchapter"
                            key={index}
                            onClick={() => void followLink(n.href)}
                          >
                            {n.title}
                          </button>
                        ))}
                    </div>
                  ))
                )}
              </aside>
            )}
            <div
              ref={stage}
              className={`reader-stage ${comic ? 'reader-comic-stage' : 'reader-prose-stage'} ${!comic && settings.readingMode === 'page' ? 'reader-paged' : ''}`}
              onScroll={() => record()}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                  e.preventDefault();
                  turn(1);
                }
                if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                  e.preventDefault();
                  turn(-1);
                }
              }}
              tabIndex={0}
              aria-label="阅读正文"
            >
              {loading ? (
                <p className="ui-muted">加载内容…</p>
              ) : comic ? (
                <div
                  className={`reader-comic-pages reader-${mode}`}
                  style={{ width: mode === 'single' ? fittedWidth : `${zoom}%` }}
                >
                  {(chapter?.pages ?? []).map((resourceId, index) => {
                    if (mode === 'single' && index !== page) return null;
                    const r = resourceMap.get(resourceId);
                    return (
                      <div data-page={index} key={resourceId}>
                        {mode === 'single' || Math.abs(index - visiblePage) <= 2 ? (
                          <ReaderImage
                            itemId={itemId}
                            resourceId={resourceId}
                            alt={`第 ${index + 1} 页`}
                            width={r?.width}
                            height={r?.height}
                          />
                        ) : (
                          <div
                            className="reader-image"
                            style={{ aspectRatio: `${r?.width ?? 800}/${r?.height ?? 1200}` }}
                          />
                        )}
                        <small className="ui-muted">
                          {index + 1} / {chapter?.pages?.length}
                        </small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <article
                  className="reader-local-prose"
                  style={{
                    fontFamily: settings.readingFont,
                    fontSize: settings.readingSize,
                    lineHeight: settings.readingLineHeight,
                    maxWidth: settings.readingWidth,
                  }}
                >
                  {blocks.map((b) =>
                    b.kind === 'image' && b.resourceId ? (
                      <div data-block={b.id} key={b.id}>
                        <ReaderImage
                          itemId={itemId}
                          resourceId={b.resourceId}
                          alt={b.text || '插图'}
                        />
                      </div>
                    ) : b.kind === 'anchor' ? (
                      <span data-block={b.id} key={b.id} />
                    ) : b.kind === 'heading' ? (
                      <h2 data-block={b.id} key={b.id}>
                        {textContent(b)}
                      </h2>
                    ) : (
                      <p data-block={b.id} key={b.id}>
                        {textContent(b)}
                      </p>
                    ),
                  )}
                </article>
              )}
            </div>
            {typeset && !comic && (
              <aside className="ui-glass reader-type-pane">
                <h3>排版设置</h3>
                <label>
                  字体
                  <select
                    className="ui-select"
                    value={settings.readingFont}
                    onChange={(e) => {
                      keepAnchor();
                      update('readingFont', e.target.value as typeof settings.readingFont);
                    }}
                  >
                    {['宋体', '微软雅黑', '楷体'].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <Slider
                  label="字号"
                  min={14}
                  max={30}
                  value={settings.readingSize}
                  onChange={(v) => {
                    keepAnchor();
                    update('readingSize', v);
                  }}
                />
                <Slider
                  label="行距"
                  min={1.2}
                  max={2.6}
                  step={0.1}
                  value={settings.readingLineHeight}
                  onChange={(v) => {
                    keepAnchor();
                    update('readingLineHeight', v);
                  }}
                />
                <Slider
                  label="正文宽度"
                  min={360}
                  max={900}
                  step={10}
                  value={settings.readingWidth}
                  onChange={(v) => {
                    keepAnchor();
                    update('readingWidth', v);
                  }}
                />
                <label>
                  阅读模式
                  <select
                    className="ui-select"
                    value={settings.readingMode}
                    onChange={(e) => update('readingMode', e.target.value as 'scroll' | 'page')}
                  >
                    <option value="scroll">滚动阅读</option>
                    <option value="page">分页阅读</option>
                  </select>
                </label>
              </aside>
            )}
          </div>
          <footer className="reader-footer reader-local-footer">
            <Button
              disabled={!ready || loading || chapterIndex === 0}
              onClick={() => changeChapter(chapterIndex - 1)}
            >
              上一{comic ? '话' : '章'}
            </Button>
            <Button disabled={!ready || loading} onClick={() => turn(-1)}>
              <ChevronLeft />
              上一页
            </Button>
            <span className="ui-grow ui-small ui-muted">
              {chapter?.title ?? '加载中'} · {percent}%
              {comic
                ? ` · 第 ${(mode === 'continuous' ? (latest.current?.page ?? page) : page) + 1} 页`
                : ` · ${chunk + 1}/${chapter?.chunks ?? 1} 段`}
            </span>
            <Button disabled={!ready || loading} onClick={() => turn(1)}>
              下一页
              <ChevronRight />
            </Button>
            <Button
              disabled={!ready || loading || chapterIndex >= chapters.length - 1}
              onClick={() => changeChapter(chapterIndex + 1)}
            >
              下一{comic ? '话' : '章'}
            </Button>
          </footer>
          {comic && (
            <div className="ui-row reader-comic-options">
              <select
                className="ui-select"
                aria-label="漫画模式"
                value={mode}
                onChange={(e) => {
                  keepAnchor();
                  setPage(latest.current?.page ?? page);
                  setMode(e.target.value as typeof mode);
                }}
              >
                <option value="single">单页</option>
                <option value="continuous">纵向连续</option>
              </select>
              <Slider
                label="缩放"
                min={40}
                max={160}
                step={10}
                value={zoom}
                onChange={(v) => {
                  keepAnchor();
                  setZoom(v);
                }}
              />
              <span>{zoom}%</span>
              <Button
                onClick={() => {
                  keepAnchor();
                  setZoom(90);
                }}
              >
                适合窗口
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
