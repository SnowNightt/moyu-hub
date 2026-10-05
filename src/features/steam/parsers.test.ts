// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  isDetail,
  parseDetail,
  parseFeatured,
  parseSearch,
  paidPrice,
  plainText,
  imageUrl,
} from './parsers';
import { gameGenres, genreTags, normalizePage } from './provider';
import featured from './fixtures/featured.json';
import detail from './fixtures/detail.json';
import search from './fixtures/search.json';
import action from './fixtures/genre-action.json';
import unavailable from './fixtures/unavailable.json';
import filters from './fixtures/genre-filters.html?raw';
describe('verified Steam fixtures', () => {
  it('maps featured, CNY minor units and detail', () => {
    const feed = parseFeatured(featured);
    expect(feed.deals[0].price).toMatchObject({
      kind: 'paid',
      currency: 'CNY',
      currentMinor: 1360,
    });
    expect(feed.popular.length).toBeGreaterThan(0);
    const game = parseDetail(detail, '620');
    expect(game.title).toBe('Portal 2');
    expect(isDetail(game)).toBe(true);
    expect(game.description).not.toContain('<');
    expect(game.screenshots.length).toBeGreaterThan(0);
  });
  it('parses real search rows preserving source count', () => {
    const result = parseSearch(search, 1);
    expect(result.items[0]).toMatchObject({
      id: '400',
      title: 'Portal',
      price: { kind: 'paid', currentMinor: 840, originalMinor: 4200, discountPercent: 80 },
    });
    expect(result.total).toBe(search.total_count);
    expect(result.pageSize).toBe(25);
  });
  it('rejects unavailable / mismatched detail and malformed feeds', () => {
    expect(() => parseDetail({ 620: { success: false } }, '620')).toThrow('不可用');
    expect(() => parseDetail(detail, '400')).toThrow();
    expect(() =>
      parseDetail({ 620: { success: true, data: { name: 'Wrong', steam_appid: 400 } } }, '620'),
    ).toThrow('AppID');
    expect(() => parseFeatured({})).toThrow();
    expect(() =>
      parseSearch({ success: true, total_count: 2, results_html: '<p>Changed</p>' }, 1),
    ).toThrow('解析失败');
    expect(parseSearch({ success: true, total_count: 0, results_html: '' }, 1).items).toEqual([]);
  });
  it('separates free, unknown and preorder prices', () => {
    const data = { ...detail['620'].data, is_free: true };
    expect(parseDetail({ 620: { success: true, data } }, '620').price.kind).toBe('free');
    expect(
      parseDetail(
        { 620: { success: true, data: { ...data, is_free: false, price_overview: undefined } } },
        '620',
      ).price.kind,
    ).toBe('unavailable');
    const preorder = parseDetail(
      {
        620: {
          success: true,
          data: { ...data, is_free: false, release_date: { coming_soon: true } },
        },
      },
      '620',
    );
    expect(preorder.comingSoon).toBe(true);
    expect(preorder.price.kind).toBe('paid');
    expect(paidPrice('USD', 100, 50, 120)).toEqual({
      kind: 'paid',
      currency: 'USD',
      currentMinor: 100,
    });
    expect(paidPrice('CNY', -1).kind).toBe('unavailable');
  });
  it('filters malicious links, bundles, images and active markup', () => {
    const row = (id: string, href: string, price = '') =>
      `<a class="search_result_row" data-ds-appid="${id}" href="${href}"><span class="title">Test</span><span class="search_price">${price}</span></a>`;
    const result = parseSearch(
      {
        success: true,
        total_count: 4,
        results_html:
          row('1,2', 'https://store.steampowered.com/bundle/1/') +
          row('1', 'https://evil.test/app/1/') +
          row('2', 'https://store.steampowered.com/app/2/') +
          row('3', 'https://store.steampowered.com/app/3/', '免费开玩'),
      },
      1,
    );
    expect(result.items.map((g) => g.id)).toEqual(['2', '3']);
    expect(result.items.map((g) => g.price.kind)).toEqual(['unavailable', 'free']);
    expect(result.total).toBe(4);
    expect(imageUrl('https://evil.test/x')).toBeUndefined();
    expect(imageUrl('javascript:alert(1)')).toBeUndefined();
    expect(plainText('<script>bad()</script><p>A</p><p>B</p>')).toBe('A\nB');
  });
  it('has eight verified tags and safe page offsets', () => {
    const document = new DOMParser().parseFromString(filters, 'text/html');
    for (const genre of gameGenres) {
      expect(document.querySelector(`[data-loc="${genre}"]`)?.getAttribute('data-value')).toBe(
        String(genreTags[genre]),
      );
    }
    expect(parseSearch(action, 1).items.length).toBeGreaterThan(0);
    expect(() => parseDetail(unavailable, '999999999')).toThrow('不可用');
    expect(gameGenres.map((g) => genreTags[g])).toEqual([19, 21, 122, 9, 599, 492, 701, 699]);
    for (const page of [0, -1, 1.2, Infinity, NaN, Number.MAX_SAFE_INTEGER])
      expect(normalizePage(page)).toBe(1);
    expect(normalizePage(3)).toBe(3);
  });
});
