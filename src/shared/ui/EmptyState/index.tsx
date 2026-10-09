import { Unplug } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  title,
  description,
  icon: Icon = Unplug,
  compact = false,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  compact?: boolean;
}) {
  return (
    <div className={`ui-empty-state ${compact ? 'ui-compact' : ''}`} role="status">
      <Icon aria-hidden="true" />
      <p>{title}</p>
      {description && <small>{description}</small>}
    </div>
  );
}
