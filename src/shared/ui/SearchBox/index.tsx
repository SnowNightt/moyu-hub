import { Search, X } from 'lucide-react';
import { Button } from '../Button';

export function SearchBox({
  placeholder,
  value,
  onChange,
  onSubmit,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  return (
    <form
      className="search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <Search aria-hidden="true" />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button variant="icon" aria-label="清空搜索" disabled={!value} onClick={() => onChange('')}>
        <X aria-hidden="true" />
      </Button>
    </form>
  );
}
