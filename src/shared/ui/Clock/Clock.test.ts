// @vitest-environment jsdom
import { act, createElement as h, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Clock } from '../index';

let root: Root, host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 9, 12, 34, 59));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it('shows the local date and 24-hour time and updates across a minute boundary', async () => {
  await act(async () => root.render(h(Clock)));
  expect(host.querySelector('.clock span')?.textContent).toContain('10/09');
  expect(host.querySelector('.clock span')?.textContent).toContain('周五');
  expect(host.querySelector('.clock strong')?.textContent).toBe('12:34');
  await act(async () => vi.advanceTimersByTime(1000));
  expect(host.querySelector('.clock strong')?.textContent).toBe('12:35');
});

it('keeps one timer under StrictMode and releases it when the page removes the clock', async () => {
  await act(async () => root.render(h(StrictMode, null, h(Clock))));
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
