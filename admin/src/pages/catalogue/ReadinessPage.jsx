import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatKes } from "@epicmkt/shared";
import LoadError from "../../components/LoadError.jsx";
import { readinessSummary } from "../../lib/readiness.js";
import ReadinessSandbox from "./ReadinessSandbox.jsx";
import { useReadiness } from "./useReadiness.js";

const MARK = { pass: "✓", fail: "✕", warn: "!" };
const WORD = { pass: "Passed", fail: "Failed", warn: "Note" };
const FILTERS = [["all", "All"], ["blocked", "Not ready"], ["ready", "Ready"]];

function CategoryCard({ category, readiness }) {
  const uid = useId();
  const card = readiness.preview?.card;
  return (
    <article className="readiness-card" aria-labelledby={`${uid}-name`}>
      <header className="readiness-card__head">
        <div>
          <h3 className="heading-sm" id={`${uid}-name`}>{category.name}</h3>
          <div className="muted">{category.grp} · {category.active ? "On" : "Off"}</div>
        </div>
        <span className={`status-pill ${readiness.ready ? "status-pill--live" : "status-pill--degraded"}`}>{readinessSummary(readiness)}</span>
      </header>
      <ul className="readiness-checks">
        {readiness.checks.map((c) => (
          <li key={c.key} className={`readiness-check readiness-check--${c.status}`}>
            <span className="readiness-check__mark" aria-hidden="true">{MARK[c.status]}</span>
            <div><strong>{c.label}</strong><span className="sr-only">: {WORD[c.status]}.</span><div className="muted">{c.detail}</div></div>
          </li>
        ))}
      </ul>
      {card ? <p className="readiness-card__preview muted">Preview: {card.name}, {card.hasPriceRange ? "from " : ""}{formatKes(card.priceMin ?? card.regularPrice ?? 0)}{readiness.preview.typeName ? ` (${readiness.preview.typeName})` : ""}</p> : null}
    </article>
  );
}

export default function ReadinessPage() {
  const { categories, byId, typesUnavailable, loading } = useReadiness();
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => (categories.data ?? []).filter((c) => byId[c.id] && (filter === "all" || (filter === "ready") === byId[c.id].ready)), [categories.data, byId, filter]);
  const ready = Object.values(byId).filter((r) => r.ready).length;
  const total = Object.keys(byId).length;

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h2 className="heading-sm">Category readiness</h2></div>
        <p className="muted">A category can be switched on only when its plans are priced, its spec rules are valid, the conformance suite passes for it and a sample item builds. Having no product type does not block: those shops sell plain items. The conformance result is the stored output of <code>npm run test:conformance</code>; refresh it with <code>npm run conformance:write</code>. <Link to="/admin/categories">Switch categories on or off</Link>.</p>
        {typesUnavailable ? <p className="readiness-note" role="status">Product types or spec rules could not be loaded for your role, so those two checks are incomplete.</p> : null}
        {categories.isError ? <LoadError what="categories" error={categories.error} onRetry={categories.refetch} /> : (
          <>
            <p aria-live="polite"><strong>{loading ? "Checking…" : `${ready} of ${total} categories ready`}</strong></p>
            <div role="group" aria-label="Show" className="readiness-filters">
              {FILTERS.map(([key, label]) => <button key={key} type="button" className={`admin-button secondary-button admin-button--sm${filter === key ? " is-active" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
            </div>
            {loading ? <span className="skeleton" /> : rows.length === 0 ? <p className="muted">Nothing here.</p> : (
              <div className="readiness-grid">{rows.map((c) => <CategoryCard key={c.id} category={c} readiness={byId[c.id]} />)}</div>
            )}
          </>
        )}
      </section>
      <ReadinessSandbox />
    </div>
  );
}
