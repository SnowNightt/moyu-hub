import type { HTMLAttributes } from 'react';

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`glass panel ${className}`} {...props} />;
}
