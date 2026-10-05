import { SteamImage } from './SteamImage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, Gamepad2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  Pagination,
  ResourceView,
  SearchBox,
  SectionTitle,
  Tabs,
} from '../../shared/ui';
import { useServices } from '../../app/services';
import { useSteamNavigation } from '../../app/steamNavigation';
import { useResource } from '../../shared/lib/useResource';
import { GameCard, GamePrice } from './GameCard';
import { SteamDataNotice } from './SteamDataNotice';
import { SteamSearchRow } from './SteamSearchRow';
import { gameGenres, normalizePage } from './provider';
import type { DealGenre, GameGenre } from './provider';
const tabs = [
  { value: 'featured', label: '精选推荐' },
  { value: 'deals', label: '限时特惠' },
  { value: 'genres', label: '游戏类型' },
  { value: 'search', label: '搜索结果' },
];
export function SteamPage() {
  const { steam } = useServices(),
    navigation = useSteamNavigation();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'featured';
  const query = (params.get('q') ?? '').trim();
  const genre = gameGenres.includes(params.get('genre') as GameGenre)
    ? (params.get('genre') as GameGenre)
    : '动作';
  const dealsGenre: DealGenre = gameGenres.includes(params.get('genre') as GameGenre)
    ? (params.get('genre') as GameGenre)
    : 'all';
  const page = normalizePage(Number(params.get('page')));
  const [draft, setDraft] = useState(query),
    [focus, setFocus] = useState(0);
  const force = useRef(false);
  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    force.current = false;
  }, [tab, query, genre, dealsGenre, page]);
  const featuredLoader = useCallback(
    (signal: AbortSignal) => steam!.getFeatured(signal, { forceRefresh: force.current }),
    [steam],
  );
  const featured = useResource(steam && tab === 'featured' ? featuredLoader : undefined);
  const listLoader = useCallback(
    async (signal: AbortSignal) => {
      const options = { forceRefresh: force.current };
      if (tab === 'deals') {
        return steam!.getDeals(dealsGenre, page, signal, options);
      }
      return tab === 'genres'
        ? steam!.browseGamesByGenre(genre, page, signal, options)
        : steam!.searchGames(query, page, signal, options);
    },
    [steam, tab, genre, dealsGenre, page, query],
  );
  const list = useResource(
    steam && tab !== 'featured' && (tab !== 'search' || !!query) ? listLoader : undefined,
  );
  const refresh = () => {
    force.current = true;
    if (tab === 'featured') featured.retry();
    else list.retry();
  };
  return (
    <>
      <PageHeader
        title="Steam"
        subtitle={<span className="badge">中国区 · 简体中文</span>}
        right={
          <SearchBox
            placeholder="游戏名称"
            value={draft}
            onChange={setDraft}
            onSubmit={() => setParams({ tab: 'search', q: draft.trim() })}
          />
        }
      />
      <div className="between">
        <Tabs
          items={tabs.filter((item) => item.value !== 'search' || !!query)}
          value={tab}
          onChange={(value) => setParams({ tab: value })}
        />
        <Button disabled={!steam} onClick={refresh}>
          刷新
        </Button>
      </div>
      {tab === 'featured' ? (
        <div className="steam-featured-sections">
          <Panel className="steam-feature">
            <ResourceView state={featured.state} label="Steam" retry={featured.retry}>
              {(result) => {
                const game = result.data.featured[focus % (result.data.featured.length || 1)];
                return game ? (
                  <>
                    <div>
                      {game.cover ? (
                        <SteamImage className="cover" src={game.cover} alt={game.title} />
                      ) : (
                        <div className="media-well">
                          <Gamepad2 />
                        </div>
                      )}
                      <div className="dots">
                        <button
                          aria-label="上一款焦点游戏"
                          onClick={() =>
                            setFocus(
                              (value) =>
                                (value - 1 + result.data.featured.length) %
                                result.data.featured.length,
                            )
                          }
                        >
                          ‹
                        </button>
                        {result.data.featured.map((g, i) => (
                          <button
                            key={g.id}
                            onClick={() => setFocus(i)}
                            className={
                              i === focus % (result.data.featured.length || 1) ? 'active' : ''
                            }
                            aria-label={`焦点游戏${i + 1}`}
                          />
                        ))}
                        <button
                          aria-label="下一款焦点游戏"
                          onClick={() =>
                            setFocus((value) => (value + 1) % result.data.featured.length)
                          }
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    <div className="feature-copy">
                      <span className="badge">新品精选</span>
                      <h2>{game.title}</h2>
                      <GamePrice price={game.price} />
                      <Button variant="primary" onClick={() => navigation.open(game.id)}>
                        查看游戏详情
                      </Button>
                      <SteamDataNotice result={result} />
                    </div>
                  </>
                ) : (
                  <EmptyState title="暂无焦点游戏" />
                );
              }}
            </ResourceView>
          </Panel>
          {(['deals', 'popular'] as const).map((kind) => (
            <Panel key={kind}>
              <SectionTitle
                title={kind === 'deals' ? '限时特惠' : '热门游戏'}
                icon={Clock3}
                action={
                  kind === 'deals' ? (
                    <Button variant="text" onClick={() => setParams({ tab: 'deals' })}>
                      查看全部
                    </Button>
                  ) : undefined
                }
              />
              <ResourceView state={featured.state} label="Steam" retry={featured.retry}>
                {(result) =>
                  result.data[kind].length ? (
                    <div className="game-grid">
                      {result.data[kind].map((game) => (
                        <GameCard key={game.id} game={game} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState compact title="暂无游戏" />
                  )
                }
              </ResourceView>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          {(tab === 'genres' || tab === 'deals') && (
            <div className="filter-bar">
              {(tab === 'deals' ? ['all', ...gameGenres] : gameGenres).map((name) => (
                <button
                  key={name}
                  className={name === (tab === 'deals' ? dealsGenre : genre) ? 'active' : ''}
                  aria-pressed={name === (tab === 'deals' ? dealsGenre : genre)}
                  onClick={() => setParams({ tab, genre: name, page: '1' })}
                >
                  {name === 'all' ? '全部' : name}
                </button>
              ))}
            </div>
          )}
          <div className="between">
            <h2>{tab === 'deals' ? '限时特惠' : tab === 'genres' ? `${genre}游戏` : '搜索结果'}</h2>
          </div>
          {tab === 'search' && !query ? (
            <EmptyState title="输入游戏名称开始搜索" />
          ) : (
            <ResourceView state={list.state} label="Steam" retry={list.retry}>
              {(result) => (
                <>
                  <SteamDataNotice result={result} />
                  <p className="small muted">
                    来源匹配 {result.data.total} 项，已过滤非单个游戏条目
                  </p>
                  {result.data.items.length ? (
                    <div className={tab === 'search' ? 'steam-search-list' : 'game-grid'}>
                      {result.data.items.map((game) =>
                        tab === 'search' ? (
                          <SteamSearchRow key={game.id} game={game} />
                        ) : (
                          <GameCard key={game.id} game={game} />
                        ),
                      )}
                    </div>
                  ) : (
                    <EmptyState title="没有找到匹配的游戏" description="尝试其他名称或游戏类型。" />
                  )}
                </>
              )}
            </ResourceView>
          )}
          <Pagination
            page={page}
            totalPages={
              list.state.status === 'ready'
                ? Math.ceil(list.state.data.data.total / list.state.data.data.pageSize)
                : 0
            }
            onChange={(value) =>
              setParams({
                tab,
                genre: tab === 'deals' ? dealsGenre : genre,
                q: query,
                page: String(value),
              })
            }
          />
        </Panel>
      )}
      <div className="fine-print">中国区价格，最终购买价格以 Steam 商店为准。</div>
    </>
  );
}
