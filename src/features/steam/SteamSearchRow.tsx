import { SteamImage } from './SteamImage';
import { Link } from 'react-router-dom';
import { useSteamNavigation } from '../../app/steamNavigation';
import { GamePrice } from './GameCard';
import type { Game } from './provider';
export function SteamSearchRow({ game }: { game: Game }) {
  const navigation = useSteamNavigation();
  return (
    <Link className="steam-search-row" to={navigation.target(game.id)} state={navigation.state}>
      <div className="empty-art">
        {game.cover ? <SteamImage className="cover" src={game.cover} alt="" /> : '暂无封面'}
      </div>
      <div className="grow">
        <h3>{game.title}</h3>
        <small className="muted">
          {game.platforms.join(' / ') || '平台未知'} · {game.releaseDate || '发行日期未知'}
          {game.comingSoon ? ' · 尚未发售' : ''}
        </small>
      </div>
      <GamePrice price={game.price} />
    </Link>
  );
}
