import { createHashRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HomePage } from '../features/home/HomePage';
import { MusicPage } from '../features/music/MusicPage';
import { SteamPage } from '../features/steam/SteamPage';
import { HeyBoxPage } from '../features/heybox/HeyBoxPage';
import { ReaderPage } from '../features/reader/ReaderPage';
import { ReadingPage } from '../features/reader/ReadingPage';
import { SettingsPage } from '../features/settings/SettingsPage';

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/music', element: <MusicPage /> },
      { path: '/steam', element: <SteamPage /> },
      { path: '/steam/detail/:gameId?', element: <SteamPage /> },
      { path: '/heybox', element: <HeyBoxPage /> },
      { path: '/reader', element: <ReaderPage /> },
      { path: '/reader/work/:workId?', element: <ReaderPage /> },
      { path: '/reader/novel/:itemId?', element: <ReadingPage /> },
      { path: '/reader/comic/:itemId?', element: <ReadingPage comic /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
