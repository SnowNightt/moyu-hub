import { useRef } from 'react';

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="ui-tabs"
      role="tablist"
      ref={ref}
      onKeyDown={(event) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = items.findIndex((item) => item.value === value);
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
        onChange(items[index].value);
        ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
      }}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          tabIndex={value === item.value ? 0 : -1}
          className={value === item.value ? 'ui-active' : ''}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
