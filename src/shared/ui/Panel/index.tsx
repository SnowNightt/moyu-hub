import type { HTMLAttributes } from 'react';

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`ui-glass ui-panel ${className}`} {...props} />;
}
