import { useId, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { EMPTY_FILTERS, SORTS, countsFor, facetsOf } from "../lib/productFilters.js";
import styles from "./ProductFilters.module.css";

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
const digits = (value) => value.replace(/\D/g, "").slice(0, 9);
const kes = (n) => Number(n).toLocaleString("en-KE");
const PRESETS = [
  { label: "Under 500", min: "", max: "499" },
  { label: "500 – 1,000", min: "500", max: "1000" },
  { label: "1,000 – 5,000", min: "1000", max: "5000" },
  { label: "5,000 +", min: "5000", max: "" }
];
const stepFor = (span) => (span > 20000 ? 500 : span > 5000 ? 100 : span > 1000 ? 50 : span > 200 ? 10 : 1);

function Section({ title, open: initial = true, summary, children }) {
  const [open, setOpen] = useState(initial);
  const id = useId();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHead}>
        <button type="button" className={styles.sectionBtn} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          <span>{title}</span>
          {!open && summary ? <span className={styles.summary}>{summary}</span> : null}
          <FontAwesomeIcon icon={faChevronDown} className={styles.chev} data-open={open || undefined} aria-hidden="true" />
        </button>
      </h3>
      <div id={id} className={styles.sectionBody} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function Check({ checked, count, disabled, onChange, children }) {
  return (
    <label className={styles.check} data-disabled={disabled || undefined}>
      <input type="checkbox" className={styles.native} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.box} aria-hidden="true" />
      <span className={styles.label}>{children}</span>
      {count != null && <span className={styles.count}>{count}</span>}
    </label>
  );
}

// A long list that shows its first few rows (and every ticked one) with a "See more" toggle, as on big shops.
function CheckList({ rows, selected, onToggle, limit = 6, noun }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.filter((r, i) => i < limit || selected.includes(r.id));
  const hidden = rows.length - shown.length;
  return (
    <>
      <div className={styles.list}>
        {shown.map((r) => (
          <Check key={r.id} checked={selected.includes(r.id)} count={r.count} disabled={r.count === 0 && !selected.includes(r.id)} onChange={() => onToggle(r.id)}>
            {r.name}
          </Check>
        ))}
      </div>
      {(hidden > 0 || (all && rows.length > limit)) && (
        <button type="button" className={styles.more} onClick={() => setAll((v) => !v)} aria-expanded={all}>
          <FontAwesomeIcon icon={faChevronDown} className={styles.moreChev} data-open={all || undefined} aria-hidden="true" />
          {all ? "See less" : `See ${hidden} more ${noun}`}
        </button>
      )}
    </>
  );
}

function PriceRange({ filters, bounds, onChange }) {
  const lo = bounds?.min ?? 0;
  const hi = Math.max(bounds?.max ?? 0, lo + 1);
  const step = stepFor(hi - lo);
  const minV = filters.min === "" ? lo : Math.min(Math.max(Number(filters.min), lo), hi);
  const maxV = filters.max === "" ? hi : Math.min(Math.max(Number(filters.max), lo), hi);
  const pct = (v) => ((v - lo) / (hi - lo)) * 100;
  const active = PRESETS.find((p) => p.min === filters.min && p.max === filters.max);

  return (
    <div className={styles.price}>
      {bounds && (
        <div className={styles.slider} style={{ "--from": `${pct(minV)}%`, "--to": `${pct(maxV)}%` }}>
          <div className={styles.track} aria-hidden="true" />
          <input
            type="range"
            className={styles.thumb}
            aria-label="Minimum price"
            min={lo}
            max={hi}
            step={step}
            value={minV}
            onChange={(e) => {
              const v = Math.min(Number(e.target.value), maxV);
              onChange({ min: v <= lo ? "" : String(v) });
            }}
          />
          <input
            type="range"
            className={styles.thumb}
            aria-label="Maximum price"
            min={lo}
            max={hi}
            step={step}
            value={maxV}
            onChange={(e) => {
              const v = Math.max(Number(e.target.value), minV);
              onChange({ max: v >= hi ? "" : String(v) });
            }}
          />
        </div>
      )}
      <div className={styles.fields}>
        <label className={styles.money}>
          <span className={styles.cur}>KES</span>
          <input className={styles.moneyInput} inputMode="numeric" aria-label="Minimum price in KES" placeholder={bounds ? kes(lo) : "Min"} value={filters.min} onChange={(e) => onChange({ min: digits(e.target.value) })} />
        </label>
        <span aria-hidden="true" className={styles.dash}>to</span>
        <label className={styles.money}>
          <span className={styles.cur}>KES</span>
          <input className={styles.moneyInput} inputMode="numeric" aria-label="Maximum price in KES" placeholder={bounds ? kes(hi) : "Max"} value={filters.max} onChange={(e) => onChange({ max: digits(e.target.value) })} />
        </label>
      </div>
      <div className={styles.presets} role="group" aria-label="Price ranges">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className={styles.preset} aria-pressed={active === p} onClick={() => onChange(active === p ? { min: "", max: "" } : { min: p.min, max: p.max })}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const FLAG_ROWS = [
  ["inStock", "In stock"],
  ["onSale", "On sale"],
  ["flash", "Flash sale"],
  ["photo", "With a photo"]
];
const STORE_ROWS = [
  ["verified", "Verified stores"],
  ["featured", "Featured stores"]
];

// Every way to narrow or reorder the products. Each change applies at once and every option shows how many products
// it would leave, so the shopper never ticks a box that empties the list without seeing it coming.
export default function ProductFilters({ filters, products, categories = [], categoryName, onChange }) {
  const bounds = useMemo(() => facetsOf(products).price, [products]);
  const counts = useMemo(() => countsFor(products, filters), [products, filters]);
  const towns = useMemo(() => facetsOf(products).towns, [products]);

  // Rows keep a fixed order (most products first, judged over the whole list) so they do not jump about as the
  // shopper ticks; only the numbers beside them change.
  const totals = useMemo(() => countsFor(products, EMPTY_FILTERS), [products]);

  const categoryRows = useMemo(() => {
    const known = categories.length ? categories : [...new Set(products.map((p) => p.business?.categoryId).filter(Boolean))].map((id) => ({ id, name: categoryName(id) }));
    return known
      .map((c, i) => ({ id: c.id, name: c.name, count: counts.categories.get(c.id) ?? 0, i }))
      .sort((a, b) => (totals.categories.get(b.id) ?? 0) - (totals.categories.get(a.id) ?? 0) || a.i - b.i);
  }, [categories, products, counts, totals, categoryName]);
  const townRows = useMemo(
    () => towns.map((t) => ({ id: t.slug, name: t.name, count: counts.towns.get(t.slug) ?? 0 })).sort((a, b) => (totals.towns.get(b.id) ?? 0) - (totals.towns.get(a.id) ?? 0) || a.name.localeCompare(b.name)),
    [towns, counts, totals]
  );

  const priceSummary = filters.min || filters.max ? `KES ${filters.min || "0"} – ${filters.max || "any"}` : null;

  return (
    <form className={styles.panel} aria-label="Product filters" onSubmit={(e) => e.preventDefault()}>
      <div className={styles.top}>
        <div className={styles.search}>
          <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search products"
            className={styles.searchInput}
            maxLength={80}
            placeholder="Search name, store or town"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
          />
          {filters.q && (
            <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => onChange({ q: "" })}>
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          )}
        </div>
        <label className={styles.sort}>
          <span className={styles.sortLabel}>Sort by</span>
          <select className={styles.select} value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <Section title="Price" summary={priceSummary}>
        <PriceRange filters={filters} bounds={bounds} onChange={onChange} />
      </Section>

      <Section title="Category" summary={filters.categories.length ? `${filters.categories.length} selected` : null}>
        <CheckList rows={categoryRows} selected={filters.categories} onToggle={(id) => onChange({ categories: toggle(filters.categories, id) })} noun="categories" />
      </Section>

      <Section title="Product" summary={FLAG_ROWS.filter(([k]) => filters[k]).length ? `${FLAG_ROWS.filter(([k]) => filters[k]).length} selected` : null}>
        <div className={styles.list}>
          {FLAG_ROWS.map(([key, label]) => (
            <Check key={key} checked={filters[key]} count={counts.flags[key]} disabled={counts.flags[key] === 0 && !filters[key]} onChange={(v) => onChange({ [key]: v })}>
              {label}
            </Check>
          ))}
        </div>
      </Section>

      <Section title="Store" open={filters.verified || filters.featured}>
        <div className={styles.list}>
          {STORE_ROWS.map(([key, label]) => (
            <Check key={key} checked={filters[key]} count={counts.flags[key]} disabled={counts.flags[key] === 0 && !filters[key]} onChange={(v) => onChange({ [key]: v })}>
              {label}
            </Check>
          ))}
        </div>
      </Section>

      {townRows.length > 1 && (
        <Section title="Town" open={filters.towns.length > 0} summary={filters.towns.length ? `${filters.towns.length} selected` : null}>
          <CheckList rows={townRows} selected={filters.towns} onToggle={(id) => onChange({ towns: toggle(filters.towns, id) })} noun="towns" />
        </Section>
      )}
    </form>
  );
}
