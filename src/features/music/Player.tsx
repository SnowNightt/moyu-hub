import { Disc3, ListMusic, Maximize2, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, EmptyState, Slider } from '../../shared/ui';
import { usePlayer } from './playerStore';
import { useSettings } from '../settings/store';

export function PlaybackControls() {
  return (
    <div className="player-controls">
      <Button variant="icon" disabled aria-label="上一首">
        <SkipBack />
      </Button>
      <button className="round-play" disabled aria-label="播放">
        <Play />
      </button>
      <Button variant="icon" disabled aria-label="下一首">
        <SkipForward />
      </Button>
    </div>
  );
}
export function TrackArtwork({ cover, title = '' }: { cover?: string; title?: string }) {
  return cover ? (
    <img className="cover" src={cover} alt={title} />
  ) : (
    <div className="cover empty-art" aria-hidden="true">
      <Disc3 />
    </div>
  );
}
export function Player() {
  const current = usePlayer((state) => state.current);
  const queue = usePlayer((state) => state.queue);
  const { settings, update } = useSettings();
  const navigate = useNavigate();
  const [queueOpen, setQueueOpen] = useState(false);
  return (
    <>
      <footer className="player" aria-label="全局音乐播放器">
        <TrackArtwork cover={current?.cover} title={current?.title} />
        <div className="song-meta">
          <strong>{current?.title ?? '尚未选择歌曲'}</strong>
          <small>{current?.artist ?? '网易云音乐尚未接入'}</small>
        </div>
        <PlaybackControls />
        <div className="timeline">
          <span>—:—</span>
          <Slider value={0} label="歌曲播放进度" disabled />
          <span>—:—</span>
        </div>
        <Volume2 className="volume-icon" aria-hidden="true" />
        <Slider
          className="volume"
          value={settings.volume}
          label="播放音量"
          onChange={(value) => update('volume', value)}
        />
        <div className="end-controls">
          <Button variant="icon" onClick={() => setQueueOpen(true)} aria-label="播放列表">
            <ListMusic />
          </Button>
          <Button variant="icon" onClick={() => navigate('/music')} aria-label="打开音乐与歌词">
            <Maximize2 />
          </Button>
        </div>
      </footer>
      <Dialog title="播放列表" open={queueOpen} onClose={() => setQueueOpen(false)}>
        {queue.length ? (
          queue.map((song) => (
            <p key={song.id}>
              {song.title} · {song.artist}
            </p>
          ))
        ) : (
          <EmptyState title="播放列表为空" description="选择歌曲后，播放队列会显示在这里。" />
        )}
      </Dialog>
    </>
  );
}
