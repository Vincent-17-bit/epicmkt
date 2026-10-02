import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { RADII } from "../lib/filters.js";
import styles from "./FilterPanel.module.css";

function Toggle({ checked, onChange, children }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" className={styles.native} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.box}>
        <FontAwesomeIcon icon={faCheck} className={styles.tick} />
      </span>
      {children}
    </label>
  );
}

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

      {facets?.areas?.length > 0 && (
        <div className={styles.group}>
          <label htmlFor={id("area")} className={styles.legend}>
            Area or town
          </label>
          <select id={id("area")} className={styles.select} value={filters.area} onChange={(e) => onChange({ area: e.target.value })}>
            <option value="">All areas</option>
            {facets.areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>
      )}

      {facets?.fields?.length > 0 && (
        <fieldset className={styles.group}>
          <legend className={styles.legend}>{facets.categoryName}</legend>
          {facets.fields.map((field) =>
            field.type === "boolean" ? (
              <Toggle
                key={field.key}
                checked={filters.attrs[field.key] === "true"}
                onChange={(on) => onChange({ attrs: { [field.key]: on ? "true" : "" } })}
              >
                {field.label}
              </Toggle>
            ) : (
              <div key={field.key} className={styles.sub}>
                <label htmlFor={id(field.key)} className={styles.subLabel}>
                  {field.label}
                </label>
                <select
                  id={id(field.key)}
                  className={styles.select}
                  value={filters.attrs[field.key] ?? ""}
                  onChange={(e) => onChange({ attrs: { [field.key]: e.target.value } })}
                >
                  <option value="">Any</option>
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )
          )}
        </fieldset>
      )}
    </form>
  );
}
