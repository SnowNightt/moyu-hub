import { useLocation } from 'react-router-dom';
import { SteamDetail } from './SteamDetail';
import { useSteamNavigation } from '../../app/steamNavigation';
export function SteamDetailController() {
  const location = useLocation(),
    navigation = useSteamNavigation();
  const direct = location.pathname.match(/^\/steam\/detail(?:\/([^/]+))?\/?$/);
  const query =
    location.pathname === '/' || location.pathname === '/steam'
      ? new URLSearchParams(location.search).get('game')
      : null;
  if (!direct && query === null) return null;
  const id = direct ? (direct[1] ?? '') : query!;
  return <SteamDetail key={`${location.key}:${id}`} id={id} open onClose={navigation.close} />;
}
