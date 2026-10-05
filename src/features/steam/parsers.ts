import type { FeaturedGames, Game, GameDetail, GamePrice } from './provider';
import { steamPageSize, validAppId } from './provider';
import type { PageResult } from '../../shared/lib/resource';
export const imageHosts = [
  'shared.akamai.steamstatic.com',
  'shared.fastly.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'cdn.fastly.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
];
export function imageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      imageHosts.includes(url.hostname) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Invalid remote URL. */
  }
}
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown) => array(v).filter((x): x is string => typeof x === 'string');
const minor = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function paidPrice(
  currency: unknown,
  current: unknown,
  original?: unknown,
  discount?: unknown,
): GamePrice {
  if (!minor(current) || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
    return { kind: 'unavailable' };
  return {
    kind: 'paid',
    currency,
    currentMinor: current,
    ...(minor(original) && original > current ? { originalMinor: original } : {}),
    ...(typeof discount === 'number' && discount > 0 && discount <= 100
      ? { discountPercent: discount }
      : {}),
  };
}
export function plainText(html: unknown) {
  const doc = new DOMParser().parseFromString(text(html), 'text/html');
  doc.querySelectorAll('script,style,iframe,object,noscript').forEach((n) => n.remove());
  doc.querySelectorAll('br,p,div,h1,h2,h3,li').forEach((n) => n.append('\n'));
  return (doc.body.textContent ?? '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}
function featuredGame(value: unknown): Game | undefined {
  const v = object(value),
    id = String(v.id);
  if (!validAppId(id) || !text(v.name) || v.type !== 0) return;
  return {
    id,
    title: text(v.name),
    cover: imageUrl(v.large_capsule_image ?? v.header_image),
    genres: [],
    platforms: [
      ['windows_available', 'Windows'],
      ['mac_available', 'macOS'],
      ['linux_available', 'Linux'],
    ]
      .filter(([key]) => v[key] === true)
      .map(([, label]) => label),
    price:
      v.is_free === true
        ? { kind: 'free' }
        : paidPrice(v.currency, v.final_price, v.original_price, v.discount_percent),
  };
}
export function parseFeatured(raw: unknown): FeaturedGames {
  const v = object(raw);
  const read = (key: string) => {
    const source = object(v[key]).items;
    if (!Array.isArray(source)) throw new Error('Steam 精选格式发生变化');
    const items = source.map(featuredGame).filter((g): g is Game => !!g);
    if (source.length && !items.length) throw new Error('Steam 精选条目解析失败');
    return items;
  };
  return { featured: read('new_releases'), deals: read('specials'), popular: read('top_sellers') };
}
export function parseDetail(raw: unknown, id: string): GameDetail {
  const entry = object(object(raw)[id]),
    v = object(entry.data);
  if (entry.success !== true) throw new Error('此游戏在当前地区不可用');
  if (String(v.steam_appid) !== id || !text(v.name))
    throw new Error('Steam 详情格式或 AppID 不匹配');
  const price = object(v.price_overview),
    platforms = object(v.platforms),
    release = object(v.release_date);
  return {
    id,
    title: text(v.name),
    cover: imageUrl(v.header_image),
    genres: array(v.genres)
      .map((g) => text(object(g).description))
      .filter(Boolean),
    platforms: [
      ['windows', 'Windows'],
      ['mac', 'macOS'],
      ['linux', 'Linux'],
    ]
      .filter(([key]) => platforms[key] === true)
      .map(([, label]) => label),
    releaseDate: text(release.date),
    comingSoon: release.coming_soon === true,
    price:
      v.is_free === true
        ? { kind: 'free' }
        : paidPrice(price.currency, price.final, price.initial, price.discount_percent),
    summary: plainText(v.short_description),
    description: plainText(v.detailed_description),
    screenshots: array(v.screenshots)
      .map((s) => imageUrl(object(s).path_full))
      .filter((s): s is string => !!s),
    developers: strings(v.developers),
    publishers: strings(v.publishers),
  };
}
function searchPrice(row: Element): GamePrice {
  const label =
    row.querySelector('.discount_final_price, .search_price')?.textContent?.trim() ?? '';
  if (/^(免费|免费开玩|免费游玩|Free|Free to Play)$/i.test(label)) return { kind: 'free' };
  if (!/^[¥￥]\s*[\d,.]+$/.test(label)) return { kind: 'unavailable' };
  const amount = row.querySelector('[data-price-final]')?.getAttribute('data-price-final');
  const original = row.querySelector('.discount_original_price')?.textContent?.trim();
  return paidPrice(
    'CNY',
    amount && /^\d+$/.test(amount)
      ? Number(amount)
      : Math.round(Number(label.replace(/[¥￥,\s]/g, '')) * 100),
    original && /^[¥￥]\s*[\d,.]+$/.test(original)
      ? Math.round(Number(original.replace(/[¥￥,\s]/g, '')) * 100)
      : undefined,
    Number(row.querySelector('[data-discount]')?.getAttribute('data-discount')),
  );
}
export function parseSearch(raw: unknown, page: number): PageResult<Game> {
  const v = object(raw);
  if (v.success !== true && v.success !== 1) throw new Error('Steam 搜索服务不可用');
  if (
    typeof v.results_html !== 'string' ||
    !Number.isSafeInteger(v.total_count) ||
    Number(v.total_count) < 0
  )
    throw new Error('Steam 搜索格式发生变化');
  const doc = new DOMParser().parseFromString(v.results_html, 'text/html'),
    items: Game[] = [];
  for (const row of doc.querySelectorAll('a.search_result_row')) {
    const id = row.getAttribute('data-ds-appid') ?? '',
      title = row.querySelector('.title')?.textContent?.trim();
    let url: URL;
    try {
      url = new URL(row.getAttribute('href') ?? '');
    } catch {
      continue;
    }
    if (
      !validAppId(id) ||
      !title ||
      url.protocol !== 'https:' ||
      url.hostname !== 'store.steampowered.com' ||
      !url.pathname.startsWith(`/app/${id}/`)
    )
      continue;
    const releaseDate = row.querySelector('.search_released')?.textContent?.trim();
    items.push({
      id,
      title,
      cover: imageUrl(row.querySelector('img')?.getAttribute('src')),
      genres: [],
      platforms: [
        ['win', 'Windows'],
        ['mac', 'macOS'],
        ['linux', 'Linux'],
      ]
        .filter(([key]) => row.querySelector(`.platform_img.${key}`))
        .map(([, label]) => label),
      releaseDate,
      comingSoon: /即将|待定|Coming Soon/i.test(releaseDate ?? ''),
      price: searchPrice(row),
    });
  }
  if (Number(v.total_count) > 0 && !items.length)
    throw new Error('Steam 搜索条目解析失败，请稍后重试');
  return {
    items: [...new Map(items.map((g) => [g.id, g])).values()],
    total: Number(v.total_count),
    page,
    pageSize: steamPageSize,
  };
}
export function isGame(v: unknown): v is Game {
  const g = object(v),
    p = object(g.price);
  return (
    validAppId(String(g.id)) &&
    typeof g.id === 'string' &&
    !!text(g.title) &&
    Array.isArray(g.genres) &&
    g.genres.every((x) => typeof x === 'string') &&
    Array.isArray(g.platforms) &&
    g.platforms.every((x) => typeof x === 'string') &&
    (g.releaseDate === undefined || typeof g.releaseDate === 'string') &&
    (g.comingSoon === undefined || typeof g.comingSoon === 'boolean') &&
    (g.cover === undefined || imageUrl(g.cover) === g.cover) &&
    (p.kind === 'free' ||
      p.kind === 'unavailable' ||
      (p.kind === 'paid' &&
        minor(p.currentMinor) &&
        typeof p.currency === 'string' &&
        /^[A-Z]{3}$/.test(p.currency) &&
        (p.originalMinor === undefined || minor(p.originalMinor)) &&
        (p.discountPercent === undefined ||
          (typeof p.discountPercent === 'number' &&
            p.discountPercent > 0 &&
            p.discountPercent <= 100))))
  );
}
export const isFeatured = (v: unknown): v is FeaturedGames =>
  ['featured', 'deals', 'popular'].every(
    (k) => Array.isArray(object(v)[k]) && (object(v)[k] as unknown[]).every(isGame),
  );
export const isPage = (v: unknown): v is PageResult<Game> => {
  const p = object(v);
  return (
    Array.isArray(p.items) &&
    p.items.every(isGame) &&
    Number.isSafeInteger(p.total) &&
    Number(p.total) >= 0 &&
    Number.isSafeInteger(p.page) &&
    Number(p.page) > 0 &&
    p.pageSize === steamPageSize
  );
};
export const isDetail = (v: unknown): v is GameDetail => {
  const g = object(v);
  return (
    isGame(v) &&
    typeof g.summary === 'string' &&
    typeof g.description === 'string' &&
    ['developers', 'publishers'].every(
      (k) => Array.isArray(g[k]) && (g[k] as unknown[]).every((x) => typeof x === 'string'),
    ) &&
    Array.isArray(g.screenshots) &&
    g.screenshots.every((s) => typeof s === 'string' && imageUrl(s) === s)
  );
};
