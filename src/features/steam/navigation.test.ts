// @vitest-environment jsdom
import { createElement as h, StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext, type AppServices } from '../../app/services';
import { SteamDetailController } from './SteamDetailController';
import { SteamPage } from './SteamPage';
import { HomePage } from '../home/HomePage';
import { parseDetail, parseFeatured, parseSearch } from './parsers';
import detail from './fixtures/detail.json';
import featured from './fixtures/featured.json';
import search from './fixtures/search.json';
import deals from './fixtures/deals.json';
import dealsPage2 from './fixtures/deals-page2.json';
import type { SteamData } from './provider';
const result = <T>(data: T): SteamData<T> => ({
  data,
  fetchedAt: new Date().toISOString(),
  stale: false,
});
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => {
    element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
};
async function mount(entry: string) {
  const game = parseDetail(detail, '620');
  const load = vi.fn().mockResolvedValue(result(game));
  const feed = vi.fn().mockResolvedValue(result([game]));
  const searchGames = vi
    .fn()
    .mockImplementation((_query, page) => Promise.resolve(result(parseSearch(search, page))));
  const getDeals = vi
    .fn()
    .mockImplementation((_genre, page) =>
      Promise.resolve(result(parseSearch(page === 2 ? dealsPage2 : deals, page))),
    );
  const services: AppServices = {
    home: {
      getSteamGames: feed,
      getReading: async () => {
        throw new Error('reading failed');
      },
    },
    steam: {
      getFeatured: async () => result(parseFeatured(featured)),
      getDeals,
      searchGames,
      browseGamesByGenre: async () => result(parseSearch(search, 1)),
      getGameDetail: load,
    },
  };
  const router = createMemoryRouter(
    [
      {
        element: h('div', null, h(Outlet), h(SteamDetailController)),
        children: [
          { path: '/', element: h(HomePage) },
          { path: '/steam', element: h(SteamPage) },
          { path: '/steam/detail/:gameId?', element: h(SteamPage) },
        ],
      },
    ],
    { initialEntries: [entry] },
  );
  await act(async () => {
    root.render(
      h(
        StrictMode,
        null,
        h(ServicesContext.Provider, { value: services }, h(RouterProvider, { router })),
      ),
    );
  });
  return { router, load, feed, searchGames, getDeals };
}
describe('Steam navigation', () => {
  it('loads home independently and preserves its background under StrictMode', async () => {
    const { router, feed } = await mount('/');
    expect(feed).toHaveBeenCalled();
    expect(host.textContent).not.toContain('最近使用');
    expect(host.querySelector('.home-steam')?.textContent).not.toContain('刷新推荐');
    expect(host.querySelector('.home-steam')?.textContent).not.toContain('更新于');
    expect(host.textContent).toContain('reading failed');
    expect(host.textContent).toContain('Portal 2');
    const home = host.querySelector('.home-top');
    await click(host.querySelector('.steam-game-card'));
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?game=620');
    expect(host.querySelector('.home-top')).toBe(home);
    await click([...host.querySelectorAll('button')].find((b) => b.textContent === '刷新详情')!);
    await click(host.querySelector('[aria-label="关闭游戏详情"]'));
    expect(router.state.location.search).toBe('');
    await click(host.querySelector('.steam-game-card'));
  });
  it('search page 3 survives open, close and history navigation without reloading the list', async () => {
    const { router, searchGames } = await mount('/steam?tab=search&q=portal&page=3');
    const before = searchGames.mock.calls.length;
    const rows = host.querySelector('.steam-search-list');
    await click(host.querySelectorAll('.steam-search-row')[1]);
    expect(router.state.location.search).toContain('page=3&game=620');
    await click(host.querySelector('[aria-label="关闭游戏详情"]'));
    expect(router.state.location.search).toBe('?tab=search&q=portal&page=3');
    expect(host.querySelector('.steam-search-list')).toBe(rows);
    expect(searchGames).toHaveBeenCalledTimes(before);
    await act(async () => {
      await router.navigate(1);
    });
    expect(host.querySelector('dialog[open]')).not.toBeNull();
  });
  it('direct query close removes only game; direct canonical close returns to Steam', async () => {
    const { router } = await mount('/steam?tab=genres&genre=动作&game=620');
    await click(host.querySelector('[aria-label="关闭游戏详情"]'));
    expect(router.state.location.search).not.toContain('game=');
    expect(router.state.location.search).toContain('tab=genres');
    await act(async () => {
      await router.navigate('/steam/detail/620');
    });
    await click(host.querySelector('[aria-label="关闭游戏详情"]'));
    expect(router.state.location.pathname).toBe('/steam');
    expect(host.textContent).not.toContain('最近浏览');
    expect(host.querySelectorAll('.steam-featured-sections > .ui-panel')).toHaveLength(3);
  });
  it('invalid ID never loads; Esc closes it', async () => {
    const { load, router } = await mount('/?game=bad');
    expect(host.textContent).toContain('游戏地址无效');
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      host
        .querySelector('dialog[open]')!
        .dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true }));
    });
    expect(router.state.location.search).toBe('');
  });
  it('deals default to all, preserve source order, paginate and reset page on genre changes', async () => {
    const { router, getDeals } = await mount('/steam?tab=deals&sort=price');
    expect(host.querySelector('select[aria-label="游戏排序"]')).toBeNull();
    expect(host.querySelectorAll('.ui-filter-bar button')).toHaveLength(9);
    expect(host.querySelector('.ui-filter-bar button[aria-pressed="true"]')?.textContent).toBe(
      '全部',
    );
    expect(getDeals.mock.lastCall?.slice(0, 2)).toEqual(['all', 1]);
    expect([...host.querySelectorAll('.steam-game-card h3')].map((n) => n.textContent)).toEqual(
      parseSearch(deals, 1).items.map((g) => g.title),
    );
    await click([...host.querySelectorAll('button')].find((b) => b.textContent === '下一页')!);
    expect(getDeals.mock.lastCall?.slice(0, 2)).toEqual(['all', 2]);
    expect(host.querySelector('.steam-game-card h3')?.textContent).toBe(
      parseSearch(dealsPage2, 2).items[0].title,
    );
    const location = router.state.location.search;
    await click(host.querySelector('.steam-game-card'));
    await click(host.querySelector('[aria-label="关闭游戏详情"]'));
    expect(router.state.location.search).toBe(location);
    await click(
      [...host.querySelectorAll('.ui-filter-bar button')].find((b) => b.textContent === '动作')!,
    );
    expect(getDeals.mock.lastCall?.slice(0, 2)).toEqual(['动作', 1]);
    await click([...host.querySelectorAll('button')].find((b) => b.textContent === '下一页')!);
    expect(getDeals.mock.lastCall?.slice(0, 2)).toEqual(['动作', 2]);
    await click(
      [...host.querySelectorAll('.ui-filter-bar button')].find((b) => b.textContent === '全部')!,
    );
    expect(getDeals.mock.lastCall?.slice(0, 2)).toEqual(['all', 1]);
  });
});
