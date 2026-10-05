// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SteamScreenshotCarousel } from './SteamScreenshotCarousel';
let root: Root, host: HTMLDivElement;
const shots = [
  'https://shared.akamai.steamstatic.com/1.jpg',
  'https://shared.akamai.steamstatic.com/2.jpg',
  'https://shared.akamai.steamstatic.com/3.jpg',
];
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
const render = async (screenshots = shots, key = 'game1') => {
  await act(async () =>
    root.render(h(SteamScreenshotCarousel, { screenshots, title: '游戏', key })),
  );
};
const click = async (label: string) => {
  await act(async () => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
};
it('wraps in both directions, selects preview images and resets for another game', async () => {
  await render();
  expect(host.querySelectorAll('.steam-carousel-previews img')).toHaveLength(shots.length);
  await click('上一张截图');
  expect(host.querySelector('img')?.src).toBe(shots[2]);
  await click('下一张截图');
  expect(host.querySelector('img')?.src).toBe(shots[0]);
  await click('查看第 2 张截图');
  expect(host.querySelector('img')?.src).toBe(shots[1]);
  expect(host.querySelector('[aria-label="查看第 2 张截图"]')?.getAttribute('aria-pressed')).toBe(
    'true',
  );
  await act(async () =>
    host
      .querySelector('button')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      ),
  );
  expect(host.querySelector('img')?.src).toBe(shots[2]);
  await click('下一张预览');
  expect(host.querySelector('img')?.src).toBe(shots[0]);
  await click('上一张预览');
  expect(host.querySelector('img')?.src).toBe(shots[2]);
  await render(shots, 'game2');
  expect(host.querySelector('img')?.src).toBe(shots[0]);
});
it('autoplays without a playback button, resumes after hover, and clears its timer', async () => {
  await render();
  expect(host.querySelector('[aria-label="暂停截图轮播"], [aria-label="播放截图轮播"]')).toBeNull();
  await act(async () => vi.advanceTimersByTime(5000));
  expect(host.querySelector('img')?.src).toBe(shots[1]);
  await act(async () =>
    host.querySelector('section')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
  );
  await act(async () => vi.advanceTimersByTime(10000));
  expect(host.querySelector('img')?.src).toBe(shots[1]);
  await act(async () =>
    host
      .querySelector('section')!
      .dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })),
  );
  await act(async () => vi.advanceTimersByTime(5000));
  expect(host.querySelector('img')?.src).toBe(shots[2]);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
it('handles no screenshots, a single image and loading failure without carousel controls', async () => {
  await render([]);
  expect(host.textContent).toContain('暂无截图');
  await render([shots[0]]);
  expect(host.querySelector('button')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(host.textContent).toContain('图片暂不可用');
});
