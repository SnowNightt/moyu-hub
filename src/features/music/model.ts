export type Song = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  cover?: string;
};
export type Playlist = { id: string; title: string; cover?: string; trackCount: number };
export type LyricLine = { time: number; text: string };
export type MusicAccount = { id: string; nickname: string; avatar?: string };
