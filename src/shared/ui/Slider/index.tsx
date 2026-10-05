export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  disabled = false,
  className = '',
}: {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="range"
      className={className}
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );
}
