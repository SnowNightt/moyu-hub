import { SteamImage } from './SteamImage';
import { Gamepad2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Game } from './provider';
import { useSteamNavigation } from '../../app/steamNavigation';

export function GamePrice({ price }: { price: Game['price'] }) {
  if (price.kind === 'unavailable') return <small className="ui-muted">暂无价格信息</small>;
  if (price.kind === 'free') return <strong className="steam-price">免费游玩</strong>;
  const formatter = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: price.currency });
  return (
    <div className="steam-price">
      {!!price.discountPercent && <span className="steam-discount">-{price.discountPercent}%</span>}
      <strong>{formatter.format(price.currentMinor / 100)}</strong>
      {price.originalMinor !== undefined && price.originalMinor > price.currentMinor && (
        <del>{formatter.format(price.originalMinor / 100)}</del>
      )}
    </div>
  );
}
export function GameCard({ game, home = false }: { game: Game; home?: boolean }) {
  const navigation = useSteamNavigation();
  return (
    <Link
      className="steam-game-card"
      to={navigation.target(game.id)}
      state={navigation.state}
      aria-label={`查看${game.title}详情`}
    >
      <div className="steam-art">
        {game.cover ? (
          <SteamImage className="ui-cover" src={game.cover} alt={game.title} />
        ) : (
          <div className="ui-cover ui-empty-art">
            <Gamepad2 />
          </div>
        )}
        {home && <h3>{game.title}</h3>}
      </div>
      {!home && (
        <>
          <h3>{game.title}</h3>
          <div className="steam-platforms">
            {[...game.genres, ...game.platforms].map((label) => (
              <span className="ui-tag" key={label}>
                {label}
              </span>
            ))}
          </div>
        </>
      )}
      <GamePrice price={game.price} />
      {game.comingSoon && <small>尚未发售</small>}
    </Link>
  );
}
