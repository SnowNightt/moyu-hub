import type { SVGProps } from 'react';

const iconProps: SVGProps<SVGSVGElement> = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export function MusicSectionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 17V6l11-3v11M9 10l11-3" />
      <ellipse cx="6" cy="17.5" rx="3" ry="2.5" />
      <ellipse cx="17" cy="14.5" rx="3" ry="2.5" />
      <path d="M3 7v4M1 9h4" />
    </svg>
  );
}

export function GameSectionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M8 6h8c2.3 0 3.5 1.4 4 3.5l1.5 7c.5 2.4-1.6 3.8-3.3 2.1L15 15H9l-3.2 3.6c-1.7 1.7-3.8.3-3.3-2.1l1.5-7C4.5 7.4 5.7 6 8 6Z" />
      <path d="M7.5 9v4M5.5 11h4M10 6l1-2h3" />
      <circle cx="16" cy="10" r=".9" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12.5" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BoxSectionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" />
      <path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5v4l-3 1.7" />
    </svg>
  );
}
