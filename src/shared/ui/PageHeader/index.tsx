import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="heading">
        <h1>{title}</h1>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {right}
    </header>
  );
}
