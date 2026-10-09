import type { ComponentType, ReactNode, SVGProps } from 'react';

export function SectionTitle({
  title,
  icon: Icon,
  brand,
  action,
}: {
  title: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  brand?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-panel-head">
      <div className="ui-section-title">
        {Icon && <Icon aria-hidden="true" />}
        {brand && <img className="ui-module-logo" src={`/brand/${brand}.png`} alt="" />}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
