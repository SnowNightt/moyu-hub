import { SteamImage } from './SteamImage';
import { useCallback, useRef } from 'react';
import { Gamepad2, Image } from 'lucide-react';
import { Dialog, EmptyState, ResourceView } from '../../shared/ui';
import { useServices } from '../../app/services';
import { useResource } from '../../shared/lib/useResource';
import { GamePrice } from './GameCard';
import { SteamDataNotice } from './SteamDataNotice';
import { validAppId } from './provider';
import { SteamScreenshotCarousel } from './SteamScreenshotCarousel';

export function SteamDetail({
  id,
  open,
  onClose,
}: {
  id?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { steam } = useServices();
  const force = useRef(false);
  const loader = useCallback(
    (signal: AbortSignal) => steam!.getGameDetail(id!, signal, { forceRefresh: force.current }),
    [steam, id],
  );
  const { state, retry } = useResource(steam && id && validAppId(id) && open ? loader : undefined);
  return (
    <Dialog title="游戏详情" open={open} onClose={onClose} wide>
      {!validAppId(id ?? '') && <EmptyState title="游戏地址无效" />}
      {state.status !== 'unconfigured' && (
        <ResourceView
          state={state}
          retry={retry}
          label="游戏详情"
          empty={id ? '接入 Steam 后显示游戏详情。' : '选择游戏后显示详情。'}
        >
          {(result) => {
            const game = result.data;
            return (
              <>
                <SteamDataNotice result={result} />
                <button
                  className="ui-button-text"
                  onClick={() => {
                    force.current = true;
                    retry();
                  }}
                >
                  刷新详情
                </button>
                <div className="steam-game-detail-layout">
                  <div>
                    <SteamScreenshotCarousel
                      key={game.id}
                      screenshots={game.screenshots}
                      title={game.title}
                    />
                    <div className="steam-game-intro">
                      <h2>游戏介绍</h2>
                      <p>{game.description || '暂无介绍'}</p>
                    </div>
                  </div>
                  <div className="steam-game-detail-side">
                    <h1>{game.title}</h1>
                    {game.cover ? (
                      <SteamImage className="ui-cover" src={game.cover} alt={game.title} />
                    ) : (
                      <EmptyState compact title="暂无封面" icon={Gamepad2} />
                    )}
                    <p>{game.summary}</p>
                    <GamePrice price={game.price} />
                    {game.comingSoon && <span className="ui-badge">尚未发售</span>}
                    <small>中国区价格，以 Steam 结算页为准。</small>
                    {[
                      ['支持平台', game.platforms.join(' / ')],
                      ['发行日期', game.releaseDate],
                      ['开发商', game.developers.join(' / ')],
                      ['发行商', game.publishers.join(' / ')],
                      ['游戏类型', game.genres.join(' / ')],
                    ].map(([name, value]) => (
                      <div className="steam-meta-row" key={name}>
                        <span>{name}</span>
                        <span>{value || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          }}
        </ResourceView>
      )}
      {state.status === 'unconfigured' && validAppId(id ?? '') && (
        <div className="steam-game-detail-layout steam-detail-frame">
          <div>
            <div className="ui-media-well">
              <Image />
              <small>游戏截图</small>
            </div>
            <div className="steam-screenshots steam-empty-shots">
              {['主图', '截图', '截图'].map((label, index) => (
                <div key={index} className="ui-media-well">
                  <Image />
                  <small>{label}</small>
                </div>
              ))}
            </div>
            <h2>游戏介绍</h2>
            <p className="ui-muted">选择游戏后显示介绍</p>
          </div>
          <div className="steam-game-detail-side">
            <h2>尚未选择游戏</h2>
            <div className="ui-media-well">
              <Gamepad2 />
            </div>
            {['价格与折扣', '支持平台', '发行日期', '开发商', '发行商', '游戏类型'].map((label) => (
              <div className="steam-meta-row" key={label}>
                <span>{label}</span>
                <span>—</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
