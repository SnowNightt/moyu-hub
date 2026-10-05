import type { PageResult } from '../../shared/lib/resource';
import type { Song, Playlist, LyricLine, MusicAccount } from './model';

/** api-enhanced integration will implement this contract; no calls or sample songs yet. */
export interface MusicProvider {
  search(query: string, page: number, signal: AbortSignal): Promise<PageResult<Song>>;
  playlists(signal: AbortSignal): Promise<Playlist[]>;
  playlistTracks(id: string, signal: AbortSignal): Promise<Song[]>;
  recent(signal: AbortSignal): Promise<Song[]>;
  account(signal: AbortSignal): Promise<MusicAccount | null>;
  loginQR(signal: AbortSignal): Promise<{ key: string; image: string }>;
  checkLogin(
    key: string,
    signal: AbortSignal,
  ): Promise<'waiting' | 'scanned' | 'expired' | 'authorized'>;
  logout(): Promise<void>;
  playbackURL(id: string, signal: AbortSignal): Promise<string>;
  lyrics(id: string, signal: AbortSignal): Promise<LyricLine[]>;
}
