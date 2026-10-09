export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="ui-switch"
      role="switch"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange?.(event.target.checked)}
    />
  );
}
