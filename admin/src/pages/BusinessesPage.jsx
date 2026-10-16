import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import {
  PAGE_SIZE, TABS, activeFilterCount, bulkActionsFor, listToParams, parseList, statusLabel, statusTone, toCsv,
} from "../lib/businesses.js";
import { fmtDate } from "../lib/peek.js";
import { deleteView, readViews, saveView } from "../lib/savedViews.js";
import { errorMessage } from "../lib/errors.js";
import { useAdminRole } from "../lib/useAdminRole.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import ActionDialog from "../components/ActionDialog.jsx";
import DataTable from "../components/DataTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { CountdownRing, HealthRing } from "../components/Rings.jsx";

const PLANS = [["", "Any plan"], ["standard", "Standard"], ["premium", "Premium"]];
const VERIFY = [["", "Any verification"], ["verified", "Verified"], ["unverified", "Not verified"]];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tag / assign agent / message for the selection. Reason-based actions use ActionDialog instead.
function BulkExtraDialog({ kind, count, agents, onSubmit, onClose }) {
  const ref = useRef(null);
  const [form, setForm] = useState({ add: "", remove: "", agent: "", subject: "", body: "", in_app: true, sms: false, email: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useFocusTrap(ref, true);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const list = (s) => s.split(",").map((t) => t.trim()).filter(Boolean);
  const channels = ["in_app", "sms", "email"].filter((c) => form[c]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    let args;
    if (kind === "tag") {
      if (!list(form.add).length && !list(form.remove).length) return setError("Add or remove at least one tag.");
      args = { add: list(form.add), remove: list(form.remove) };
    } else if (kind === "assign") {
      args = { agent: form.agent || null };
    } else {
      if (!form.body.trim()) return setError("Write the message.");
      if (!channels.length) return setError("Choose at least one channel.");
      if ((form.in_app || form.email) && !form.subject.trim()) return setError("Add a subject for in-app and email messages.");
      args = { subject: form.subject.trim() || null, body: form.body.trim(), channels };
    }
    setBusy(true);
    try {
      await onSubmit(args);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const title = { tag: "Tag", assign: "Assign agent", message: "Message" }[kind];
  return (
    <div className="dialog" role="presentation">
      <div className="dialog__scrim" onClick={() => !busy && onClose()} />
      <form className="dialog__panel" role="dialog" aria-modal="true" aria-label={title} ref={ref} onSubmit={submit} noValidate>
        <h2 className="dialog__title">{title} · {count} business{count === 1 ? "" : "es"}</h2>
        {kind === "tag" ? (
          <>
            <label className="field"><span>Tags to add (comma separated)</span><input value={form.add} onChange={set("add")} autoFocus /></label>
            <label className="field"><span>Tags to remove</span><input value={form.remove} onChange={set("remove")} /></label>
          </>
        ) : null}
        {kind === "assign" ? (
          <label className="field"><span>Agent</span>
            <select value={form.agent} onChange={set("agent")} autoFocus>
              <option value="">Unassigned</option>
              {agents.map((a) => <option key={a.user_id} value={a.user_id}>{a.display_name || a.email}</option>)}
            </select>
          </label>
        ) : null}
        {kind === "message" ? (
          <>
            <fieldset className="field field--row"><legend>Send by</legend>
              {[["in_app", "In-app"], ["sms", "SMS"], ["email", "Email"]].map(([k, l]) => (
                <label key={k} className="check"><input type="checkbox" checked={form[k]} onChange={set(k)} /> {l}</label>
              ))}
            </fieldset>
            <label className="field"><span>Subject (in-app and email)</span><input value={form.subject} onChange={set("subject")} maxLength={150} /></label>
            <label className="field"><span>Message</span><textarea rows={4} maxLength={form.sms ? 480 : 1000} value={form.body} onChange={set("body")} /></label>
          </>
        ) : null}
        <div aria-live="polite">{error ? <p className="form-error" role="alert">{error}</p> : null}</div>
        <div className="dialog__actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Working…" : title}</button>
        </div>
      </form>
    </div>
  );
}

export default function BusinessesPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAdminRole();
  const list = useMemo(() => parseList(params), [params]);
  const [search, setSearch] = useState(list.q);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // { kind: "action" | "extra", key }
  const [views, setViews] = useState(() => readViews());
  const [notice, setNotice] = useState("");

  const update = useCallback((patch, { resetPage = true } = {}) => {
    const next = { ...list, ...patch, ...(resetPage && !("page" in patch) ? { page: 1 } : {}) };
    const out = listToParams(next);
    const peek = params.get("peek");
    if (peek) out.set("peek", peek);
    setParams(out, { replace: true });
  }, [list, params, setParams]);

  // Debounced search: 300ms after the last keystroke.
  useEffect(() => {
    if (search === list.q) return undefined;
    const t = setTimeout(() => update({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search, list.q, update]);
  useEffect(() => setSearch(list.q), [list.q]);
  useEffect(() => setSelected(new Set()), [list.tab, list.q, list.sort, list.dir, list.page, JSON.stringify(list.filters)]);

  const queryKey = ["admin-businesses", list.tab, list.q, list.sort, list.dir, list.page, list.filters];
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({ queryKey, queryFn: () => api.listBusinesses(list), placeholderData: (prev) => prev });
  const { data: agents = [] } = useQuery({ queryKey: ["admin-agents"], queryFn: () => api.listAgents(), staleTime: 5 * 60_000 });

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? {};
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const chosen = rows.filter((r) => selected.has(r.id));
  const bulk = bulkActionsFor(chosen, role);
  const filterCount = activeFilterCount(list.filters);
  const agentName = (id) => agents.find((a) => a.user_id === id)?.display_name ?? agents.find((a) => a.user_id === id)?.email ?? "";

  const onSort = (key) => update(list.sort === key ? { dir: list.dir === "asc" ? "desc" : "asc" } : { sort: key, dir: "asc" });
  const setFilter = (key, value) => update({ filters: { ...list.filters, [key]: value } });

  const bulkRun = useMutation({
    mutationFn: ({ action, reason, args }) => api.bulkBusinesses(chosen.map((r) => r.id), action, { reason, args }),
    onSuccess: (res, vars) => {
      setDialog(null);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
      const skipped = res.skipped?.length ?? 0;
      setNotice(`${res.done} updated${skipped ? `, ${skipped} skipped (state changed or not found)` : ""}.`);
    },
  });

  const runBulk = (form) => {
    const key = dialog.key;
    const args = key === "feature" ? { featured: true, until: form.until ? new Date(form.until).toISOString() : null, rank: form.rank ? Number(form.rank) : null }
      : key === "extend" ? { days: Number(form.days) } : {};
    return bulkRun.mutateAsync({ action: key, reason: form.reason?.trim() || null, args });
  };

  const openBulk = (a) => {
    if (!a.allowed) return;
    if (a.key === "export") {
      download(`businesses-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(chosen.length ? chosen : rows));
      return;
    }
    setDialog({ kind: a.extra ? "extra" : "action", key: a.key });
  };

  const columns = [
    { key: "name", label: "Business", sortKey: "name", render: (r) => (
      <div className="biz-cell">
        <Link to={`/admin/businesses/${r.id}`} className="biz-cell__name" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
        <span className="biz-cell__sub">{r.seller_id}{r.tags?.length ? ` · ${r.tags.join(", ")}` : ""}</span>
      </div>) },
    { key: "town", label: "Town", sortKey: "town", render: (r) => r.town ?? "—" },
    { key: "plan", label: "Plan", render: (r) => <span className="tag">{r.plan_key}</span> },
    { key: "status", label: "Status", render: (r) => (
      <span className={`status-pill status-pill--${statusTone(r.status)}`} title={r.visibility?.reason}>{statusLabel(r.status)}{r.featured ? " ★" : ""}</span>) },
    { key: "health", label: "Health", sortKey: "health", render: (r) => <HealthRing score={r.health} /> },
    { key: "paid", label: "Paid until", sortKey: "paid_until", render: (r) => (
      <div className="biz-paid"><CountdownRing paidUntil={r.paid_until} /><span>{r.paid_until ? fmtDate(r.paid_until) : "—"}</span></div>) },
    { key: "flags", label: "Flags", sortKey: "open_flags", className: "num", render: (r) => (r.open_flags ? <span className="status-pill status-pill--warn">{r.open_flags}</span> : "—") },
    { key: "agent", label: "Agent", render: (r) => agentName(r.assigned_agent) || "—" },
  ];
  if (list.tab === "recycle") columns.splice(6, 1, { key: "deleted", label: "Deleted", render: (r) => fmtDate(r.deleted_at) });

  const saveCurrent = () => {
    const name = window.prompt("Name this view");
    if (name) setViews(saveView(name, list));
  };
  const applyView = (v) => {
    const out = listToParams(v.list);
    setParams(out, { replace: true });
  };

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>Businesses</h3>
          <div className="toolbar">
            <button type="button" className="secondary-button" onClick={() => download(`businesses-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows))} disabled={!rows.length}>Export page</button>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Business lists">
          {TABS.map((t) => (
            <button key={t.key} role="tab" type="button" aria-selected={list.tab === t.key} className={`tabs__tab ${list.tab === t.key ? "is-on" : ""}`} onClick={() => update({ tab: t.key })}>
              {t.label}<span className="tabs__count">{counts[t.key] ?? "–"}</span>
            </button>
          ))}
        </div>

        <div className="filter-bar">
          <label className="admin-global-search filter-bar__search"><span aria-hidden="true">⌕</span>
            <input type="search" aria-label="Search businesses" placeholder="Name, seller ID, phone, email, town" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="secondary-button" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>Filters{filterCount ? ` (${filterCount})` : ""}</button>
          <div className="views">
            <select aria-label="Saved views" value="" onChange={(e) => { const v = views.find((x) => x.name === e.target.value); if (v) applyView(v); }}>
              <option value="">Saved views{views.length ? ` (${views.length})` : ""}</option>
              {views.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
            <button type="button" className="secondary-button" onClick={saveCurrent}>Save view</button>
            {views.length ? <button type="button" className="link-button" onClick={() => { const n = window.prompt(`Delete which view? ${views.map((v) => v.name).join(", ")}`); if (n) setViews(deleteView(n)); }}>Delete view</button> : null}
          </div>
        </div>

        {showFilters ? (
          <div className="filters" role="group" aria-label="Filters">
            <label className="field"><span>Plan</span><select value={list.filters.plan ?? ""} onChange={(e) => setFilter("plan", e.target.value)}>{PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field"><span>Verification</span><select value={list.filters.verification ?? ""} onChange={(e) => setFilter("verification", e.target.value)}>{VERIFY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field"><span>Town</span><input value={list.filters.town ?? ""} onChange={(e) => setFilter("town", e.target.value)} /></label>
            <label className="field"><span>Tag</span><input value={list.filters.tag ?? ""} onChange={(e) => setFilter("tag", e.target.value.toLowerCase())} /></label>
            <label className="field"><span>Agent</span><select value={list.filters.agent ?? ""} onChange={(e) => setFilter("agent", e.target.value)}><option value="">Any agent</option>{agents.map((a) => <option key={a.user_id} value={a.user_id}>{a.display_name || a.email}</option>)}</select></label>
            <label className="field"><span>Health from</span><input type="number" min="0" max="100" value={list.filters.minHealth ?? ""} onChange={(e) => setFilter("minHealth", e.target.value)} /></label>
            <label className="field"><span>Health to</span><input type="number" min="0" max="100" value={list.filters.maxHealth ?? ""} onChange={(e) => setFilter("maxHealth", e.target.value)} /></label>
            <label className="field"><span>Paid from</span><input type="date" value={list.filters.paidFrom ?? ""} onChange={(e) => setFilter("paidFrom", e.target.value)} /></label>
            <label className="field"><span>Paid to</span><input type="date" value={list.filters.paidTo ?? ""} onChange={(e) => setFilter("paidTo", e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={Boolean(list.filters.featured)} onChange={(e) => setFilter("featured", e.target.checked)} /> Featured only</label>
            <label className="check"><input type="checkbox" checked={Boolean(list.filters.hasFlags)} onChange={(e) => setFilter("hasFlags", e.target.checked)} /> Has open flags</label>
            <label className="check"><input type="checkbox" checked={Boolean(list.filters.unassigned)} onChange={(e) => setFilter("unassigned", e.target.checked)} /> Unassigned</label>
            <button type="button" className="link-button" onClick={() => update({ filters: {} })} disabled={!filterCount}>Clear filters</button>
          </div>
        ) : null}

        {selected.size > 0 ? (
          <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
            <strong>{selected.size} selected</strong>
            {bulk.map((a) => (
              <button key={a.key} type="button" className={a.danger ? "danger-button" : "secondary-button"} disabled={!a.allowed} title={a.allowed ? undefined : "Your role cannot do this"} onClick={() => openBulk(a)}>{a.label}</button>
            ))}
            <button type="button" className="link-button" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        ) : null}
        <div aria-live="polite">{notice ? <p className="notice" role="status">{notice} <button type="button" className="link-button" onClick={() => setNotice("")}>Dismiss</button></p> : null}</div>

        <DataTable
          caption="Businesses" columns={columns} rows={rows} loading={isLoading} error={isError ? errorMessage(error) : ""} onRetry={refetch}
          sort={list.sort} dir={list.dir} onSort={onSort} selectable selected={selected}
          onToggle={(id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onToggleAll={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())}
          onRowOpen={(r) => navigate(`/admin/businesses/${r.id}`)}
          empty={list.tab === "recycle"
            ? <EmptyState title="The recycle bin is empty" icon="🗑">Deleted businesses wait here until an owner restores them.</EmptyState>
            : <EmptyState title="No businesses match" action={list.q || filterCount ? { label: "Clear search and filters", onClick: () => { setSearch(""); update({ q: "", filters: {} }); } } : undefined}>Try another tab, search or filter.</EmptyState>}
        />

        <div className="pager">
          <span>{total} business{total === 1 ? "" : "es"}{isFetching ? " · updating…" : ""}</span>
          <div>
            <button type="button" className="secondary-button" disabled={list.page <= 1} onClick={() => update({ page: list.page - 1 }, { resetPage: false })}>Previous</button>
            <span className="pager__page">Page {Math.min(list.page, pages)} of {pages}</span>
            <button type="button" className="secondary-button" disabled={list.page >= pages} onClick={() => update({ page: list.page + 1 }, { resetPage: false })}>Next</button>
          </div>
        </div>
      </section>

      {dialog?.kind === "action" ? (
        <ActionDialog actionKey={dialog.key} count={chosen.length} business={chosen[0]} onSubmit={runBulk} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "extra" ? (
        <BulkExtraDialog kind={dialog.key} count={chosen.length} agents={agents} onClose={() => setDialog(null)}
          onSubmit={(args) => bulkRun.mutateAsync({ action: dialog.key, reason: null, args })} />
      ) : null}
    </div>
  );
}
