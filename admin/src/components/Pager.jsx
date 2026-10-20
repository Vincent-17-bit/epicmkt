import Button from "./Button.jsx";

/** Previous / Next for a server-paged list. Hidden when everything fits on one page. */
export default function Pager({ page, pageSize, total, onPage }) {
  if (!total || total <= pageSize) return null;
  const last = Math.ceil(total / pageSize) - 1;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="pager" aria-label="Pages">
      <span>{from}–{to} of {total}</span>
      <Button size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button size="sm" disabled={page >= last} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}
