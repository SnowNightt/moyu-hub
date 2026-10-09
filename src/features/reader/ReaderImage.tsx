import { useEffect, useRef, useState } from 'react';
import { useServices } from '../../app/services';
export function ReaderImage({
  itemId,
  resourceId,
  alt,
  thumbnail = false,
  width = 800,
  height = 1200,
}: {
  itemId: string;
  resourceId: string;
  alt: string;
  thumbnail?: boolean;
  width?: number;
  height?: number;
}) {
  const { reader } = useServices();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(thumbnail);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (thumbnail) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '400px',
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [thumbnail]);
  useEffect(() => {
    setUrl(undefined);
    setError('');
    if (!visible || !reader) return;
    const controller = new AbortController();
    let acquired: string | undefined;
    void reader
      .asset(itemId, resourceId, thumbnail, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) {
          URL.revokeObjectURL(value);
          return;
        }
        acquired = value;
        setUrl(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => {
      controller.abort();
      if (acquired) URL.revokeObjectURL(acquired);
    };
  }, [itemId, resourceId, thumbnail, visible, reader]);
  return (
    <div
      ref={ref}
      className={thumbnail ? 'reader-cover' : 'reader-image'}
      style={{ aspectRatio: `${width}/${height}` }}
    >
      {url ? (
        <img src={url} alt={alt} />
      ) : (
        <span className="ui-muted ui-small">{error || (visible ? '加载图片…' : alt)}</span>
      )}
    </div>
  );
}
