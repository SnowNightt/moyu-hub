import { useState } from 'react';
type Props = { src: string; alt: string; className?: string };
function ImageContent({ src, alt, className }: Props) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={`${className ?? ''} empty-art`} role="img" aria-label={alt || '图片暂不可用'}>
      <small>图片暂不可用</small>
    </div>
  ) : (
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />
  );
}
export function SteamImage(props: Props) {
  return <ImageContent key={props.src} {...props} />;
}
