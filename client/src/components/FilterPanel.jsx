import { useEffect, useState } from "react";
import Toggle from "./Toggle.jsx";
import TemplateFilters from "./TemplateFilters.jsx";
import { RADII } from "../lib/filters.js";
import styles from "./FilterPanel.module.css";

export default function FilterPanel({ idPrefix, filters, facets, onChange }) {
  const [price, setPrice] = useState({ min: filters.minPrice, max: filters.maxPrice });

  useEffect(() => {
    setPrice({ min: filters.minPrice, max: filters.maxPrice });
  }, [filters.minPrice, filters.maxPrice]);

  const commitPrice = () => {
    let { min, max } = price;
    if (min !== "" && max !== "" && Number(min) > Number(max)) [min, max] = [max, min];
    if (min !== filters.minPrice || max !== filters.maxPrice) onChange({ minPrice: min, maxPrice: max });
  };

  const id = (name) => `${idPrefix}-${name}`;

  return (
    <form
      className={styles.panel}
      aria-label="Filters"
      onSubmit={(e) => {
        e.preventDefault();
        commitPrice();
      }}
    >
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Availability</legend>
        <Toggle checked={filters.openNow} onChange={(openNow) => onChange({ openNow })}>
          Open now
        </Toggle>
        <Toggle checked={filters.verified} onChange={(verified) => onChange({ verified })}>
          Verified only
        </Toggle>
        <Toggle checked={filters.featured} onChange={(featured) => onChange({ featured })}>
          Featured only
        </Toggle>
      </fieldset>

      <div className={styles.group}>
        <label htmlFor={id("radius")} className={styles.legend}>
          Distance
        </label>
        <select
          id={id("radius")}
          className={styles.select}
          value={filters.radius}
          onChange={(e) => onChange({ radius: Number(e.target.value) })}
        >
          <option value={0}>Any distance</option>
          {RADII.map((km) => (
            <option key={km} value={km}>
              Within {km} km
            </option>
          ))}
        </select>
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Price from (KSh)</legend>
        <div className={styles.range}>
          <label htmlFor={id("pmin")} className={styles.srOnly}>
            Minimum price
          </label>
          <input
            id={id("pmin")}
            className={styles.input}
            type="number"
            inputMode="numeric"
            min="0"
            placeholder={facets?.price ? String(facets.price.min) : "Min"}
            value={price.min}
            onChange={(e) => setPrice((p) => ({ ...p, min: e.target.value }))}
            onBlur={commitPrice}
          />
          <span aria-hidden="true">–</span>
          <label htmlFor={id("pmax")} className={styles.srOnly}>
            Maximum price
          </label>
          <input
            id={id("pmax")}
            className={styles.input}
            type="number"
            inputMode="numeric"
            min="0"
            placeholder={facets?.price ? String(facets.price.max) : "Max"}
            value={price.max}
            onChange={(e) => setPrice((p) => ({ ...p, max: e.target.value }))}
            onBlur={commitPrice}
          />
        </div>
      </fieldset>

      {facets?.towns?.length > 0 && (
        <div className={styles.group}>
          <label htmlFor={id("town")} className={styles.legend}>
            Town
          </label>
          <select id={id("town")} className={styles.select} value={filters.town} onChange={(e) => onChange({ town: e.target.value })}>
            <option value="">All towns</option>
            {facets.towns.map((town) => (
              <option key={town.slug} value={town.slug}>
                {town.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <TemplateFilters title={facets?.categoryName} fields={facets?.fields} attrs={filters.attrs} idPrefix={idPrefix} onChange={onChange} />
    </form>
  );
}
