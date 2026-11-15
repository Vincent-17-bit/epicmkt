import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { demandCsv, filterLabel } from "@epicmkt/shared";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";

const PERIODS = [7, 30];

/** What shoppers looked for and did not find, by category and type, with the shops behind each count. */
export default function DemandPage() {
  const uid = useId();
  const [period, setPeriod] = useState(7);
  const [category, setCategory] = useState("");
  const cats = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.listCategories() });
  const q = useQuery({ queryKey: ["admin-unmet-demand", period, category], queryFn: () => api.getUnmetDemand(period, category || null) });
  const names = useMemo(() => Object.fromEntries((cats.data ?? []).map((c) => [c.id, c.name])), [cats.data]);
  const rows = q.data?.rows ?? [];

  const download = () => {
    const url = URL.createObjectURL(new Blob([demandCsv(rows, { period, names })], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `unmet-demand-${period}d.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h1 className="heading-sm" id={`${uid}-t`}>Unmet demand</h1></div>
      <p className="muted">What shoppers chose and did not find, counted as different shoppers. Use it to decide which options, sizes and types to ask shops to add.</p>
      <div className="kit-row">
        <label className="field">Period
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            {PERIODS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </label>
        <label className="field">Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <Button onClick={download} disabled={rows.length === 0}>Download CSV</Button>
      </div>

      {q.isError ? <LoadError onRetry={() => q.refetch()} /> : null}
      {q.isPending ? <p className="muted" role="status">Loading…</p> : null}
      {q.data && rows.length === 0 ? <p className="muted">No unmet demand in this period.</p> : null}
      {rows.length > 0 ? (
        <div className="table-shell">
          <table>
            <caption className="sr-only">{q.data.total} asks in the last {period} days</caption>
            <thead><tr><th scope="col">Category</th><th scope="col">Type</th><th scope="col">Looked for</th><th scope="col">Shoppers</th><th scope="col">Shops</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.categoryId}-${r.productTypeId}-${filterLabel(r.filters)}`}>
                  <td>{names[r.categoryId] ?? r.categoryId}</td>
                  <td>{r.productTypeId ?? "—"}</td>
                  <td>{filterLabel(r.filters)}</td>
                  <td>{r.count}</td>
                  <td>{(r.shops ?? []).map((s, i) => <span key={s.id}>{i ? ", " : ""}<Link to={`/admin/businesses/${s.id}`}>{s.name}</Link> ({s.count})</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
