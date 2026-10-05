import { useCallback, useState } from 'react';
import { CircleUserRound, ChevronDown, ChevronRight, Disc3, Music2, QrCode } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
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
import { usePlayer } from './playerStore';
import { TrackArtwork } from './Player';
import type { Song, Playlist } from './model';

const tabs = [
  { value: 'search', label: '搜索结果' },
  { value: 'playlists', label: '我的歌单' },
  { value: 'recent', label: '最近播放' },
];
function SongTable({ songs }: { songs: Song[] }) {
  return (
    <>
      <table className="songs">
        <thead>
          <tr>
            <th>#</th>
            <th>歌曲</th>
            <th>歌手</th>
            <th>专辑</th>
            <th>时长</th>
          </tr>
        </thead>
        <tbody>
          {songs.map((song, index) => (
            <tr key={song.id}>
              <td>{index + 1}</td>
              <td>
                <div className="song-title">
                  <TrackArtwork cover={song.cover} title={song.title} />
                  {song.title}
                </div>
              </td>
              <td>{song.artist}</td>
              <td>{song.album ?? '—'}</td>
              <td>
                {Math.floor(song.duration / 60)}:
                {String(Math.floor(song.duration % 60)).padStart(2, '0')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!songs.length && <EmptyState title="没有歌曲" icon={Music2} />}
    </>
  );
}
function PlaylistGrid({ items, onSelect }: { items: Playlist[]; onSelect: (id: string) => void }) {
  return items.length ? (
    <div className="playlist-grid">
      {items.map((item) => (
        <button className="playlist" key={item.id} onClick={() => onSelect(item.id)}>
          <TrackArtwork cover={item.cover} title={item.title} />
          <h3>{item.title}</h3>
          <small>{item.trackCount} 首</small>
        </button>
      ))}
    </div>
  ) : (
    <EmptyState compact title="还没有歌单" icon={Disc3} />
  );
}
export function MusicPage() {
  const { music } = useServices();
  const current = usePlayer((state) => state.current);
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((item) => item.value === params.get('tab')) ? params.get('tab')! : 'search';
  const query = params.get('q') ?? '';
  const playlist = params.get('playlist');
  const [draft, setDraft] = useState(query);
  const [accountOpen, setAccountOpen] = useState(false);
  const changeTab = (value: string) => setParams({ tab: value });
  const selectPlaylist = (id: string) => setParams({ tab: 'playlists', playlist: id });
  const loadSongs = useCallback(
    async (signal: AbortSignal) => {
      if (playlist) return music!.playlistTracks(playlist, signal);
      if (tab === 'recent') return music!.recent(signal);
      return (await music!.search(query, 1, signal)).items;
    },
    [music, playlist, tab, query],
  );
  const songs = useResource(
    music && (playlist || tab === 'recent' || query) ? loadSongs : undefined,
  );
  const loadPlaylists = useCallback((signal: AbortSignal) => music!.playlists(signal), [music]);
  const playlists = useResource(music ? loadPlaylists : undefined);
  const loadLyrics = useCallback(
    (signal: AbortSignal) => music!.lyrics(current!.id, signal),
    [music, current],
  );
  const lyrics = useResource(music && current ? loadLyrics : undefined);
  return (
    <>
      <PageHeader
        title="网易云音乐"
        right={
          <Button onClick={() => setAccountOpen(true)}>
            <CircleUserRound />
            我的账号
            <ChevronDown />
          </Button>
        }
      />
      <div className="music-layout">
        <div className="music-main">
          <Panel className="music-table">
            <SearchBox
              placeholder="搜索歌曲、歌手或专辑"
              value={draft}
              onChange={setDraft}
              onSubmit={() => setParams({ tab: 'search', q: draft.trim() })}
            />
            <p className="small muted integration-line">
              {music ? (query ? `搜索“${query}”` : '输入关键词后搜索歌曲') : '音乐服务尚未接入'}
            </p>
            <Tabs items={tabs} value={tab} onChange={changeTab} />
            {tab === 'playlists' && !playlist ? (
              <ResourceView state={playlists.state} label="歌单服务" retry={playlists.retry}>
                {(items) => <PlaylistGrid items={items} onSelect={selectPlaylist} />}
              </ResourceView>
            ) : (
              <>
                {playlist && (
                  <Button variant="text" onClick={() => changeTab('playlists')}>
                    返回歌单
                  </Button>
                )}
                <ResourceView state={songs.state} label="音乐服务" retry={songs.retry}>
                  {(items) => <SongTable songs={items} />}
                </ResourceView>
              </>
            )}
          </Panel>
          <Panel className="playlist-panel">
            <SectionTitle
              title="我的歌单"
              action={
                <Button variant="text" onClick={() => changeTab('playlists')}>
                  查看全部
                  <ChevronRight />
                </Button>
              }
            />
            <ResourceView state={playlists.state} label="歌单服务" retry={playlists.retry}>
              {(items) => <PlaylistGrid items={items} onSelect={selectPlaylist} />}
            </ResourceView>
          </Panel>
        </div>
        <Panel className="lyrics">
          <SectionTitle title="歌词" />
          <TrackArtwork cover={current?.cover} title={current?.title} />
          <h3>{current?.title ?? '尚未选择歌曲'}</h3>
          <p className="muted">{current?.artist ?? '选择歌曲后显示歌词'}</p>
          <div className="lyric-lines">
            <ResourceView state={lyrics.state} label="歌词" empty="暂无歌词">
              {(lines) =>
                lines.length ? (
                  lines.map((line, index) => <p key={`${line.time}-${index}`}>{line.text}</p>)
                ) : (
                  <EmptyState compact title="暂无歌词" icon={Music2} />
                )
              }
            </ResourceView>
          </div>
          <div className="bottom-hint">
            <Music2 />
            音乐状态会在切换页面时继续保留
          </div>
        </Panel>
      </div>
      <Dialog title="登录网易云音乐" open={accountOpen} onClose={() => setAccountOpen(false)}>
        <div className="qr-slot">
          <QrCode />
        </div>
        <EmptyState
          title="账号服务尚未接入"
          description="接入网易云音乐服务后，使用二维码登录。"
          icon={CircleUserRound}
        />
        <div className="actions">
          <Button disabled>刷新二维码</Button>
        </div>
      </Dialog>
    </>
  );
}
