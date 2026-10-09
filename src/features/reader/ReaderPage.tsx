import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Clock3, Plus, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Panel,
  ResourceView,
  SearchBox,
  SectionTitle,
  Tabs,
} from '../../shared/ui';
import { useServices } from '../../app/services';
import { useResource } from '../../shared/lib/useResource';
import { ImportDialog } from './ImportDialog';
import type { LibraryItem } from './model';
import { ReaderImage } from './ReaderImage';
import { useShell } from '../../app/shellStore';

const tabs = [
  { value: 'shelf', label: '书架' },
  { value: 'online', label: '在线' },
  { value: 'history', label: '历史' },
];
const filters = [
  { value: 'all', label: '全部' },
  { value: 'novel', label: '小说' },
  { value: 'comic', label: '漫画' },
] as const;
function BookCard({ item }: { item: LibraryItem }) {
  const { reader } = useServices();
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const report = (e: unknown) => useShell.getState().notify(String(e));
  return (
    <article className="reader-book-card">
      {item.coverResourceId ? (
        <ReaderImage
          itemId={item.id}
          resourceId={item.coverResourceId}
          alt={`${item.title}封面`}
          thumbnail
        />
      ) : item.cover ? (
        <img className="ui-cover" src={item.cover} alt={`${item.title}封面`} />
      ) : (
        <div className="ui-cover ui-empty-art">
          <BookOpen />
        </div>
      )}
      <div className="reader-book-info">
        <h3>{item.title}</h3>
        <small>{item.author ?? '作者未提供'}</small>
        <div className="ui-row">
          <span className={`ui-badge ${item.type === 'comic' ? 'ui-comic' : ''}`}>
            {item.type === 'novel' ? '小说' : '漫画'}
          </span>
          <span className="ui-tag">{item.format}</span>
        </div>
        {item.progress && (
          <small className="ui-muted">
            已读 {Math.round((item.progress.completion ?? 0) * 100)}% ·{' '}
            {new Date(item.progress.updatedAt).toLocaleDateString()}
          </small>
        )}
        {item.availability === 'missing' && (
          <small className="reader-error">源文件已移动，请重新定位</small>
        )}
        {item.availability === 'changed' && (
          <small className="reader-error">内容已变化，请重新导入</small>
        )}
        <Link
          className="ui-button-primary"
          to={`/reader/${item.type}/${encodeURIComponent(item.id)}`}
        >
          {item.progress ? '继续阅读' : '开始阅读'}
        </Link>
        <div className="ui-row">
          {item.storageMode === 'reference' && (
            <Button
              variant="text"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void reader!
                  .select(item.format === 'folder')
                  .then(async (entries) => {
                    if (entries[0]) {
                      await reader!.relocate(item.id, entries[0]);
                      useShell.getState().notify('已重新定位，阅读进度已保留');
                    }
                  })
                  .catch(report)
                  .finally(() => setBusy(false));
              }}
            >
              重新定位
            </Button>
          )}
          <Button variant="text" onClick={() => setRemoving(true)}>
            移除
          </Button>
        </div>
        <Dialog title="移出书架" open={removing} onClose={() => setRemoving(false)}>
          <p>
            移除《{item.title}》及其阅读进度、书签
            {item.storageMode === 'copy' ? '和应用书库副本' : ''}。原始文件不会删除。
          </p>
          <div className="ui-dialog-actions">
            <Button onClick={() => setRemoving(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void reader!
                  .removeFromLibrary(item.id)
                  .then(() => setRemoving(false))
                  .catch(report)
                  .finally(() => setBusy(false));
              }}
            >
              确认移除
            </Button>
          </div>
        </Dialog>
      </div>
    </article>
  );
}
function HistoryHeader() {
  return (
    <table className="reader-history">
      <thead>
        <tr>
          {['书名', '当前章节', '阅读进度', '阅读时间', '操作'].map((name) => (
            <th key={name}>{name}</th>
          ))}
        </tr>
      </thead>
      <tbody />
    </table>
  );
}
export function ReaderPage() {
  const { reader, onlineReader } = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const { workId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((item) => item.value === params.get('tab')) ? params.get('tab')! : 'shelf';
  const filter = filters.some((item) => item.value === params.get('type'))
    ? (params.get('type') as 'all' | 'novel' | 'comic')
    : 'all';
  const query = params.get('q') ?? '';
  const [draft, setDraft] = useState(query);
  const [importOpen, setImportOpen] = useState(false);
  const loadLibrary = useCallback((signal: AbortSignal) => reader!.library(signal), [reader]);
  const library = useResource(reader ? loadLibrary : undefined);
  const loadHistory = useCallback((signal: AbortSignal) => reader!.history(signal), [reader]);
  const history = useResource(reader ? loadHistory : undefined);
  useEffect(
    () =>
      reader?.subscribe(() => {
        library.retry();
        history.retry();
      }),
    [reader, library.retry, history.retry],
  );
  const report = (e: unknown) => useShell.getState().notify(String(e));
  const loadOnline = useCallback(
    (signal: AbortSignal) => onlineReader!.search(query, filter, 1, signal),
    [onlineReader, query, filter],
  );
  const online = useResource(onlineReader && query ? loadOnline : undefined);
  const loadDetail = useCallback(
    (signal: AbortSignal) => onlineReader!.detail(workId!, signal),
    [onlineReader, workId],
  );
  const detail = useResource(onlineReader && workId ? loadDetail : undefined);
  const filterBar = (
    <div className="ui-filter-bar">
      {filters.map((item) => (
        <button
          key={item.value}
          className={filter === item.value ? 'ui-active' : ''}
          onClick={() => setParams({ tab, type: item.value, q: query })}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
  const renderHistory = (
    <>
      <HistoryHeader />
      <ResourceView state={history.state} retry={history.retry} label="阅读历史">
        {(items) =>
          items.length ? (
            <table className="reader-history">
              <tbody>
                {items.map((progress) => (
                  <tr key={progress.itemId}>
                    <td>
                      {library.state.status === 'ready'
                        ? (library.state.data.find((item) => item.id === progress.itemId)?.title ??
                          '作品不可用')
                        : '作品不可用'}
                    </td>
                    <td>
                      {progress.chapterTitle ??
                        (/^c\d+$/.test(progress.chapterId)
                          ? `第 ${Number(progress.chapterId.slice(1)) + 1} 节`
                          : progress.chapterId)}
                    </td>
                    <td>{Math.round((progress.completion ?? 0) * 100)}%</td>
                    <td>{new Date(progress.updatedAt).toLocaleString()}</td>
                    <td>
                      {library.state.status === 'ready' && (
                        <Link
                          className="ui-button-text"
                          to={`/reader/${library.state.data.find((i) => i.id === progress.itemId)?.type ?? 'novel'}/${progress.itemId}`}
                        >
                          继续
                        </Link>
                      )}
                      <Button
                        variant="text"
                        onClick={() => void reader!.hideHistory(progress.itemId).catch(report)}
                      >
                        删除记录
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="还没有阅读历史"
              description="阅读后，记录会显示在这里。"
              icon={Clock3}
            />
          )
        }
      </ResourceView>
    </>
  );
  return (
    <>
      <PageHeader
        title="阅读器"
        right={
          <div className="ui-row">
            <SearchBox
              placeholder={tab === 'online' ? '搜索小说或漫画' : '搜索书名、作者或关键词'}
              value={draft}
              onChange={setDraft}
              onSubmit={() => setParams({ tab, type: filter, q: draft.trim() })}
            />
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <Plus />
              导入本地
            </Button>
          </div>
        }
      />
      <Panel className="reader-shelf">
        <Tabs
          items={tabs}
          value={tab}
          onChange={(value) => {
            setDraft('');
            setParams({ tab: value });
          }}
        />
        {tab === 'history' ? (
          <>
            <div className="ui-between">
              <h2>阅读历史</h2>
              <Button
                variant="text"
                disabled={!reader}
                onClick={() =>
                  void reader!
                    .hideHistory()
                    .then(() => useShell.getState().notify('已清空历史列表，阅读位置和书签仍保留'))
                    .catch(report)
                }
              >
                <Trash2 />
                清空历史
              </Button>
            </div>
            {renderHistory}
          </>
        ) : tab === 'online' ? (
          <>
            {filterBar}
            <ResourceView state={online.state} retry={online.retry} label="在线阅读">
              {(data) =>
                data.items.length ? (
                  <div className="reader-book-grid">
                    {data.items.map((item) => (
                      <article className="reader-book-card" key={item.id}>
                        {item.cover && (
                          <img className="ui-cover" src={item.cover} alt={item.title} />
                        )}
                        <div className="reader-book-info">
                          <h3>{item.title}</h3>
                          <small>{item.author}</small>
                          <Link
                            className="ui-button-primary"
                            to={`/reader/work/${encodeURIComponent(item.id)}`}
                          >
                            查看作品
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="没有找到匹配的作品" icon={BookOpen} />
                )
              }
            </ResourceView>
          </>
        ) : (
          <>
            {filterBar}
            <ResourceView
              state={library.state}
              retry={library.retry}
              label="本地书架"
              empty="导入小说或漫画后，内容会显示在这里。"
            >
              {(items) => {
                const filtered = items.filter(
                  (item) =>
                    (filter === 'all' || item.type === filter) &&
                    `${item.title}${item.author ?? ''}`
                      .toLocaleLowerCase()
                      .includes(query.toLocaleLowerCase()),
                );
                return filtered.length ? (
                  <div className="reader-book-grid">
                    {filtered.map((item) => (
                      <BookCard item={item} key={item.id} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={items.length ? '没有匹配的作品' : '书架里还没有作品'}
                    description={
                      items.length ? '调整搜索词或分类后重试。' : '导入一本小说或漫画，开始阅读。'
                    }
                    icon={BookOpen}
                  />
                );
              }}
            </ResourceView>
          </>
        )}
      </Panel>
      {tab === 'shelf' && (
        <Panel className="reader-history-panel">
          <SectionTitle
            title="最近阅读"
            icon={Clock3}
            action={
              <Button variant="text" onClick={() => setParams({ tab: 'history' })}>
                查看更多
              </Button>
            }
          />
          {renderHistory}
        </Panel>
      )}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <Dialog
        title="作品详情"
        open={location.pathname.startsWith('/reader/work')}
        onClose={() => navigate('/reader?tab=online')}
        wide
      >
        <ResourceView state={detail.state} retry={detail.retry} label="作品详情">
          {(data) => (
            <>
              <h2>{data.item.title}</h2>
              <p className="ui-muted">作者：{data.item.author ?? '未提供'}</p>
              <p className="ui-plain-text">{data.summary}</p>
              <h3>章节列表</h3>
              <div className="reader-chapter-grid">
                {data.chapters.map((chapter) => (
                  <Button key={chapter.id} disabled>
                    {chapter.title}
                  </Button>
                ))}
              </div>
              <div className="ui-dialog-actions">
                <Button variant="primary" disabled>
                  加入书架
                </Button>
              </div>
            </>
          )}
        </ResourceView>
      </Dialog>
    </>
  );
}
