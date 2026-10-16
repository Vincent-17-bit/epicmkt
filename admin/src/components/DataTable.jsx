import EmptyState from "./EmptyState.jsx";

// Generic admin table: sortable headers, optional row selection, skeleton rows while loading, an empty state, and an
// error state with retry. `columns` are { key, label, sortKey?, render(row), className? }.
export default function DataTable({
  columns, rows, rowKey = (r) => r.id, loading, error, onRetry, sort, dir, onSort,
  selectable, selected, onToggle, onToggleAll, empty, caption, onRowOpen,
}) {
  const all = rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));
  const some = rows.some((r) => selected?.has(rowKey(r)));
  const span = columns.length + (selectable ? 1 : 0);

  return (
    <div className="table-shell">
      <table className="dt">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {selectable ? (
              <th className="dt__check">
                <input type="checkbox" aria-label="Select all rows on this page" checked={all} ref={(el) => el && (el.indeterminate = some && !all)} onChange={() => onToggleAll?.(!all)} />
              </th>
            ) : null}
            {columns.map((c) => {
              const active = c.sortKey && sort === c.sortKey;
              return (
                <th key={c.key} scope="col" className={c.className} aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : undefined}>
                  {c.sortKey ? (
                    <button type="button" className="dt__sort" onClick={() => onSort?.(c.sortKey)}>
                      {c.label}<span aria-hidden="true">{active ? (dir === "desc" ? " ▼" : " ▲") : ""}</span>
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} aria-hidden="true">{Array.from({ length: span }).map((__, j) => <td key={j}><span className="skeleton" /></td>)}</tr>
              ))
            : error
              ? <tr><td colSpan={span}><div className="form-error" role="alert">{error} {onRetry ? <button type="button" className="link-button" onClick={onRetry}>Try again</button> : null}</div></td></tr>
              : rows.length === 0
                ? <tr><td colSpan={span}>{empty ?? <EmptyState title="Nothing here">No rows match.</EmptyState>}</td></tr>
                : rows.map((r) => {
                    const key = rowKey(r);
                    const on = selected?.has(key);
                    return (
                      <tr key={key} className={on ? "is-selected" : undefined} onClick={onRowOpen ? () => onRowOpen(r) : undefined}>
                        {selectable ? (
                          <td className="dt__check" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" aria-label={`Select ${r.name ?? key}`} checked={Boolean(on)} onChange={() => onToggle?.(key)} />
                          </td>
                        ) : null}
                        {columns.map((c) => <td key={c.key} className={c.className}>{c.render(r)}</td>)}
                      </tr>
                    );
                  })}
        </tbody>
      </table>
    </div>
  );
}
