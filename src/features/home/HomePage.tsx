import { useCallback, useEffect } from 'react';
import { BookOpen, ChevronRight, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Clock,
  EmptyState,
  PageHeader,
  Panel,
  ResourceView,
  SectionTitle,
  Slider,
} from '../../shared/ui';
import { useServices } from '../../app/services';
import { useResource } from '../../shared/lib/useResource';
import { usePlayer } from '../music/playerStore';
import { PlaybackControls, TrackArtwork } from '../music/Player';
import { GameCard } from '../steam/GameCard';
import { SteamDataNotice } from '../steam/SteamDataNotice';
import { BoxSectionIcon, GameSectionIcon, MusicSectionIcon } from './HomeSectionIcons';

export function HomePage() {
  const services = useServices();
  const current = usePlayer((state) => state.current);
  const loadSteam = useCallback(
    (signal: AbortSignal) => services.home!.getSteamGames!(signal),
    [services.home],
  );
  const games = useResource(services.home?.getSteamGames ? loadSteam : undefined);
  const reading = useResource(services.home?.getReading);
  useEffect(() => services.reader?.subscribe(reading.retry), [services.reader, reading.retry]);
  return (
    <>
      <PageHeader title="首页" subtitle="今天，从这里继续" right={<Clock />} />
      <div className="home-top">
        <Panel className="home-music">
          <div className="section-title">
            <MusicSectionIcon />
            <h2>网易云音乐</h2>
            <span className="badge">{current ? '已暂停' : '未播放'}</span>
          </div>
          <div className="album-slot">
            <TrackArtwork cover={current?.cover} title={current?.title} />
          </div>
          <div className="song-line">
            <strong>{current?.title ?? '尚未选择歌曲'}</strong>
            <span className="small muted">
              {current ? ` / ${current.artist}` : ' / 接入后开始播放'}
            </span>
          </div>
          <div className="mini-player">
            <PlaybackControls />
            <div className="timeline">
              <span>—:—</span>
              <Slider label="首页歌曲播放进度" value={0} disabled />
              <span>—:—</span>
            </div>
          </div>
        </Panel>
        <Panel>
          <SectionTitle title="继续阅读" icon={BookOpen} />
          <ResourceView
            state={reading.state}
            retry={reading.retry}
            label="阅读记录"
            empty="导入或添加作品后，从这里继续阅读。"
          >
            {(data) =>
              data.length ? (
                data.slice(0, 2).map(({ item, progress }) => (
                  <div className="reading-row" key={item.id}>
                    <div className="grow">
                      <h3>{item.title}</h3>
                      <small>
                        {item.author} · 已读 {Math.round((progress.completion ?? 0) * 100)}%
                      </small>
                    </div>
                    <Link
                      className="primary"
                      to={`/reader/${item.type}/${encodeURIComponent(item.id)}`}
                    >
                      继续阅读
                    </Link>
                  </div>
                ))
              ) : (
                <EmptyState
                  compact
                  title="还没有阅读记录"
                  description="导入一本小说或漫画，开始阅读。"
                />
              )
            }
          </ResourceView>
        </Panel>
      </div>
      <div className="home-mid">
        <Panel className="home-steam">
          <SectionTitle
            title="Steam 精选"
            icon={GameSectionIcon}
            action={
              <Link className="text-btn" to="/steam">
                查看全部
                <ChevronRight />
              </Link>
            }
          />
          <ResourceView
            state={games.state}
            retry={games.retry}
            label="Steam"
            empty="接入后显示中国区精选和特惠游戏。"
          >
            {(data) =>
              data.data.length ? (
                <>
                  <SteamDataNotice result={data} showUpdatedAt={false} />
                  <div className="game-grid">
                    {data.data.slice(0, 3).map((game) => (
                      <GameCard game={game} key={game.id} home />
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState compact title="暂无精选游戏" />
              )
            }
          </ResourceView>
        </Panel>
        <Panel className="home-heybox">
          <SectionTitle
            title="小黑盒"
            icon={BoxSectionIcon}
            action={<span className="badge warning">未连接</span>}
          />
          <div className="heybox-empty">
            <MessagesSquare />
            <span className="small muted">服务接入后显示热门帖子</span>
          </div>
          <Link className="primary" to="/heybox">
            查看推荐界面
            <ChevronRight />
          </Link>
        </Panel>
      </div>
    </>
  );
}
