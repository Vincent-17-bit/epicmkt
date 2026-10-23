import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders } from "@fortawesome/free-solid-svg-icons";
import { EMPTY_FILTERS, SORTS, countActive } from "./serviceFilters.js";
import styles from "./ServiceFilter.module.css";

export default function ServiceFilter({ facets, filters, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const panel = useRef(null);
  const uid = useId();
  const active = countActive(filters);

  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const set = (patch) => onChange({ ...filters, ...patch });
  const id = (name) => `${uid}-${name}`;

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        ref={button}
        type="button"
        className={styles.btn}
        aria-expanded={open}
        aria-controls={id("panel")}
        aria-haspopup="true"
        aria-label={active ? `Filter products, ${active} active` : "Filter products"}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <FontAwesomeIcon icon={faSliders} aria-hidden="true" />
        <span className={styles.btnText}>Filter</span>
        {active > 0 && <span className={styles.badge}>{active}</span>}
      </button>

      {open && (
        <div ref={panel} id={id("panel")} className={styles.panel} role="group" aria-label="Filter products">
          {facets.sections.length > 1 && (
            <div className={styles.field}>
              <label htmlFor={id("section")} className={styles.label}>Category</label>
              <select id={id("section")} className={styles.control} value={filters.section} onChange={(e) => set({ section: e.target.value })}>
                <option value="">All categories</option>
                {facets.sections.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {facets.availability.length > 0 && (
            <div className={styles.field}>
              <label htmlFor={id("avail")} className={styles.label}>Availability</label>
              <select id={id("avail")} className={styles.control} value={filters.availability} onChange={(e) => set({ availability: e.target.value })}>
                <option value="">Any</option>
                {facets.availability.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          )}

          {facets.price && (
            <fieldset className={styles.field}>
              <legend className={styles.label}>Price (KSh)</legend>
              <div className={styles.range}>
                <input
                  className={styles.control}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  aria-label="Minimum price"
                  placeholder={String(facets.price.min)}
                  value={filters.min}
                  onChange={(e) => set({ min: e.target.value })}
                />
                <span aria-hidden="true">–</span>
                <input
                  className={styles.control}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  aria-label="Maximum price"
                  placeholder={String(facets.price.max)}
                  value={filters.max}
                  onChange={(e) => set({ max: e.target.value })}
                />
              </div>
            </fieldset>
          )}

          <div className={styles.field}>
            <label htmlFor={id("sort")} className={styles.label}>Sort by</label>
            <select id={id("sort")} className={styles.control} value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
              {SORTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.foot}>
            <button type="button" className={styles.clear} disabled={active === 0} onClick={() => onChange(EMPTY_FILTERS)}>
              Clear all
            </button>
            <button type="button" className={styles.done} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
