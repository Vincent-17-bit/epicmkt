import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import Button from "../components/Button.jsx";
import LoadError from "../components/LoadError.jsx";
import Pager from "../components/Pager.jsx";
import { actionLabel, diffRows } from "../lib/audit.js";
import { stamp } from "../lib/time.js";

const PAGE_SIZE = 30;

const blank = { search: "", action: "", actor: "", from: "", to: "" };

export default function AuditPage() {
  const [filters, setFilters] = useState(blank);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); setOpen(null); };

  const { data: groups = [] } = useQuery({ queryKey: ["admin-audit-groups"], queryFn: () => api.getAuditGroups() });
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-audit", filters, page],
    queryFn: () => api.listAudit({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });
  const rows = data?.rows ?? [];
  const dirty = JSON.stringify(filters) !== JSON.stringify(blank);

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h2 className="heading-sm">Audit log</h2></div>
        <p className="muted">Every change an admin makes, and what it was before. Entries cannot be edited or deleted.</p>
        <div className="toolbar">
          <label className="field">Search<input type="search" value={filters.search} placeholder="Action, id, reason, business" onChange={(e) => set({ search: e.target.value })} /></label>
          <label className="field">What
            <select value={filters.action} onChange={(e) => set({ action: e.target.value })}>
              <option value="">Everything</option>
              {groups.map((g) => <option key={g.group} value={g.group}>{actionLabel(`${g.group}.`).split(":")[0]} ({g.n})</option>)}
            </select>
          </label>
          <label className="field">Who<input value={filters.actor} placeholder="Email" onChange={(e) => set({ actor: e.target.value })} /></label>
          <label className="field">From<input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="field">To<input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} /></label>
          {dirty && <Button size="sm" onClick={() => set(blank)}>Clear filters</Button>}
        </div>

        {isError ? <LoadError what="the audit log" error={error} onRetry={refetch} /> : (
          <div className="table-shell">
            <table>
              <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Business</th><th scope="col">Reason</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {isLoading ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((__, c) => <td key={c}><span className="skeleton" /></td>)}</tr>)
                  : rows.length === 0 ? <tr><td colSpan={6}>Nothing matches these filters.</td></tr>
                  : rows.map((row) => {
                    const changes = diffRows(row.before, row.after);
                    const isOpen = open === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr>
                          <td>{stamp(row.created_at)}</td>
                          <td>{row.actor_email ?? row.actor_role}</td>
                          <td><strong>{actionLabel(row.action)}</strong><div className="muted">{row.action}{row.target_id ? ` · ${row.target_id}` : ""}</div></td>
                          <td>{row.business_id ? <Link to={`/admin/businesses/${row.business_id}`}>{row.business_name}</Link> : "–"}</td>
                          <td>{row.reason ?? "–"}</td>
                          <td>{changes.length > 0 && <Button size="sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.id)} aria-label={`${isOpen ? "Hide" : "Show"} changes for ${actionLabel(row.action)}`}>{isOpen ? "Hide" : "Changes"}</Button>}</td>
                        </tr>
                        {isOpen && (
                          <tr className="audit-diff"><td colSpan={6}>
                            <table aria-label="Changes">
                              <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
                              <tbody>{changes.map((c) => <tr key={c.field}><td>{c.field}</td><td>{c.from}</td><td>{c.to}</td></tr>)}</tbody>
                            </table>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
      </section>
    </div>
  );
}
