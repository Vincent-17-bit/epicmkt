import { useEffect, useState } from "react";
import Toggle from "./Toggle.jsx";
import { SORTS } from "../lib/productFilters.js";
import styles from "./FilterPanel.module.css";

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

// Every way to narrow or reorder the home page products. Changes apply at once; the sheet footer shows the count.
export default function ProductFilters({ filters, facets, categoryName, onChange }) {
  const [price, setPrice] = useState({ min: filters.min, max: filters.max });
  useEffect(() => setPrice({ min: filters.min, max: filters.max }), [filters.min, filters.max]);

  const commitPrice = () => {
    let { min, max } = price;
    min = /^\d{1,9}$/.test(min) ? min : "";
    max = /^\d{1,9}$/.test(max) ? max : "";
    if (min !== "" && max !== "" && Number(min) > Number(max)) [min, max] = [max, min];
    if (min !== filters.min || max !== filters.max) onChange({ min, max });
  };

  return (
    <form className={styles.panel} aria-label="Product filters" onSubmit={(e) => { e.preventDefault(); commitPrice(); }}>
      <div className={styles.group}>
        <label htmlFor="pf-sort" className={styles.legend}>Sort by</label>
        <select id="pf-sort" className={styles.select} value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className={styles.group}>
        <label htmlFor="pf-q" className={styles.legend}>Search products</label>
        <input id="pf-q" type="search" className={styles.input} maxLength={80} placeholder="Name, store or town" value={filters.q} onChange={(e) => onChange({ q: e.target.value })} />
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Price (KES)</legend>
        <div className={styles.range}>
          <label htmlFor="pf-min" className={styles.srOnly}>Minimum price</label>
          <input id="pf-min" className={styles.input} type="number" inputMode="numeric" min="0" placeholder={facets.price ? String(facets.price.min) : "Min"} value={price.min} onChange={(e) => setPrice((p) => ({ ...p, min: e.target.value }))} onBlur={commitPrice} />
          <span aria-hidden="true">–</span>
          <label htmlFor="pf-max" className={styles.srOnly}>Maximum price</label>
          <input id="pf-max" className={styles.input} type="number" inputMode="numeric" min="0" placeholder={facets.price ? String(facets.price.max) : "Max"} value={price.max} onChange={(e) => setPrice((p) => ({ ...p, max: e.target.value }))} onBlur={commitPrice} />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Product</legend>
        <Toggle checked={filters.inStock} onChange={(inStock) => onChange({ inStock })}>In stock</Toggle>
        <Toggle checked={filters.onSale} onChange={(onSale) => onChange({ onSale })}>On sale</Toggle>
        <Toggle checked={filters.flash} onChange={(flash) => onChange({ flash })}>Flash sale</Toggle>
        <Toggle checked={filters.photo} onChange={(photo) => onChange({ photo })}>With a photo</Toggle>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Store</legend>
        <Toggle checked={filters.verified} onChange={(verified) => onChange({ verified })}>Verified stores</Toggle>
        <Toggle checked={filters.featured} onChange={(featured) => onChange({ featured })}>Featured stores</Toggle>
      </fieldset>

      {facets.categories.length > 1 && (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Category</legend>
          {facets.categories.map((c) => (
            <Toggle key={c.id} checked={filters.categories.includes(c.id)} onChange={() => onChange({ categories: toggle(filters.categories, c.id) })}>
              {categoryName(c.id)} ({c.count})
            </Toggle>
          ))}
        </fieldset>
      )}

      {facets.towns.length > 1 && (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Town</legend>
          {facets.towns.map((town) => (
            <Toggle key={town.slug} checked={filters.towns.includes(town.slug)} onChange={() => onChange({ towns: toggle(filters.towns, town.slug) })}>
              {town.name} ({town.count})
            </Toggle>
          ))}
        </fieldset>
      )}
    </form>
  );
}
