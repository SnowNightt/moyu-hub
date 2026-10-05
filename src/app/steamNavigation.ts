import { useLocation, useNavigate } from 'react-router-dom';
import { validAppId } from '../features/steam/provider';
const session = crypto.randomUUID();
export function detailTarget(pathname: string, search: string, id: string) {
  const params = new URLSearchParams(search);
  params.set('game', id);
  return `${pathname}?${params}`;
}
export function useSteamNavigation() {
  const location = useLocation(),
    navigate = useNavigate();
  return {
    target: (id: string) => detailTarget(location.pathname, location.search, id),
    state: { steamOrigin: session, steamFrom: location.pathname + location.search },
    open(id: string) {
      if (!validAppId(id) || new URLSearchParams(location.search).get('game') === id) return;
      navigate(detailTarget(location.pathname, location.search, id), {
        state: { steamOrigin: session, steamFrom: location.pathname + location.search },
      });
    },
    close() {
      if (location.state?.steamOrigin === session && typeof location.state.steamFrom === 'string') {
        navigate(-1);
        return;
      }
      const params = new URLSearchParams(location.search);
      params.delete('game');
      navigate(
        {
          pathname: location.pathname.startsWith('/steam/detail') ? '/steam' : location.pathname,
          search: params.toString(),
        },
        { replace: true },
      );
    },
  };
}
