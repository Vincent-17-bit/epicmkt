import { useId } from "react";
import { Button } from "../../components/index.js";
import { SLA_FILTERS } from "../../lib/sla.js";
import s from "./applications.module.css";

export const SORT_OPTIONS = [
  { id: "submitted_at:asc", label: "Longest waiting first (SLA)", sort: "submitted_at", dir: "asc" },
  { id: "submitted_at:desc", label: "Newest first", sort: "submitted_at", dir: "desc" },
  { id: "business_name:asc", label: "Business, A to Z", sort: "business_name", dir: "asc" },
  { id: "business_name:desc", label: "Business, Z to A", sort: "business_name", dir: "desc" },
  { id: "price_at_submission:desc", label: "Highest fee first", sort: "price_at_submission", dir: "desc" },
  { id: "status:asc", label: "Status", sort: "status", dir: "asc" },
];

function Field({ label, hint, children }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.fieldLabel} htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <span className={s.fieldHint}>{hint}</span> : null}
    </div>
  );
}

/**
 * Category, plan, assignee, SLA and sort. Everything is a plain select, so it works with a keyboard, a screen reader and
 * a phone. The sort select is also how phones sort, because the stacked cards have no column headers.
 */
export default function Filters({ query, onChange, categories, reviewers, me, filtersActive, onClear }) {
  const sortId = `${query.sort}:${query.dir}`;
  const known = SORT_OPTIONS.some((o) => o.id === sortId);
  const slaApplies = query.status === "submitted" || query.status === "all";
  const colleagues = reviewers.filter((r) => r.id !== me);
  return (
    <>
      <Field label="Sort by">
        {(id) => (
          <select id={id} className={s.select} value={sortId} onChange={(e) => { const o = SORT_OPTIONS.find((x) => x.id === e.target.value); onChange({ sort: o.sort, dir: o.dir }); }}>
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            {!known ? <option value={sortId} disabled>Sorted by a column</option> : null}
          </select>
        )}
      </Field>
      <Field label="Category">
        {(id) => (
          <select id={id} className={s.select} value={query.category} onChange={(e) => onChange({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {query.category && !categories.some((c) => c.id === query.category) ? <option value={query.category}>{query.category}</option> : null}
          </select>
        )}
      </Field>
      <Field label="Plan">
        {(id) => (
          <select id={id} className={s.select} value={query.plan} onChange={(e) => onChange({ plan: e.target.value })}>
            <option value="">Any plan</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        )}
      </Field>
      <Field label="Assigned to">
        {(id) => (
          <select id={id} className={s.select} value={query.assignee} onChange={(e) => onChange({ assignee: e.target.value })}>
            <option value="any">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Unassigned</option>
            {colleagues.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            {!["any", "me", "none"].includes(query.assignee) && !colleagues.some((r) => r.id === query.assignee) ? <option value={query.assignee}>A colleague</option> : null}
          </select>
        )}
      </Field>
      <Field label="24 h SLA" hint={slaApplies ? undefined : "Submitted tab only"}>
        {(id) => (
          <select id={id} className={s.select} value={query.sla} disabled={!slaApplies} onChange={(e) => onChange({ sla: e.target.value })}>
            <option value="">Any</option>
            {SLA_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        )}
      </Field>
      {filtersActive ? <Button variant="ghost" onClick={onClear}>Clear filters</Button> : null}
    </>
  );
}
