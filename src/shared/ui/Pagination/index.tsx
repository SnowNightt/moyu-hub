import { Button } from '../Button';

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <Button disabled={page <= 1 || !totalPages} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <span>{totalPages ? `${page} / ${totalPages}` : '— / —'}</span>
      <Button disabled={!totalPages || page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页
      </Button>
    </div>
  );
}
