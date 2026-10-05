import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Image } from 'lucide-react';
import { EmptyState } from '../../shared/ui';
import { SteamImage } from './SteamImage';

export function SteamScreenshotCarousel({
  screenshots,
  title,
}: {
  screenshots: string[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const previews = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden');
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const count = screenshots.length;
  const current = count ? index % count : 0;
  const playing = count > 1 && !hovered && !focused && !hidden && !reducedMotion;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const motionChanged = () => setReducedMotion(media?.matches ?? false);
    const visibilityChanged = () => setHidden(document.visibilityState === 'hidden');
    media?.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      media?.removeEventListener('change', motionChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), 5000);
    return () => window.clearTimeout(timer);
  }, [playing, count, index]);
  useEffect(() => {
    const track = previews.current;
    const selected = track?.children[current] as HTMLElement | undefined;
    if (!track || !selected) return;
    // Scroll only the preview strip, never the surrounding details dialog.
    track.scrollTo?.({
      left: Math.max(0, selected.offsetLeft - (track.clientWidth - selected.offsetWidth) / 2),
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }, [current, count, reducedMotion]);

  if (!count) return <EmptyState title="暂无截图" icon={Image} />;
  const move = (offset: number) => setIndex((current + offset + count) % count);
  return (
    <section
      className="steam-carousel"
      aria-label={`${title}游戏截图`}
      aria-roledescription="轮播图"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (count < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }}
    >
      <div className="steam-carousel-stage" aria-live={playing ? 'off' : 'polite'}>
        <SteamImage
          className="cover steam-carousel-image"
          src={screenshots[current]}
          alt={`${title}截图 ${current + 1} / ${count}`}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              className="steam-carousel-arrow previous"
              aria-label="上一张截图"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="steam-carousel-arrow next"
              aria-label="下一张截图"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </button>
          </>
        )}
        <span className="steam-carousel-count">
          {current + 1} / {count}
        </span>
      </div>
      {count > 1 && (
        <div className="steam-carousel-controls">
          <button
            type="button"
            className="steam-carousel-preview-arrow"
            aria-label="上一张预览"
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </button>
          <div className="steam-carousel-previews" ref={previews} aria-label="截图预览">
            {screenshots.map((url, position) => (
              <button
                type="button"
                key={position}
                aria-label={`查看第 ${position + 1} 张截图`}
                aria-pressed={position === current}
                onClick={() => setIndex(position)}
              >
                <SteamImage className="cover" src={url} alt={`${title}截图 ${position + 1} 预览`} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="steam-carousel-preview-arrow"
            aria-label="下一张预览"
            onClick={() => move(1)}
          >
            <ChevronRight />
          </button>
        </div>
      )}
    </section>
  );
}
