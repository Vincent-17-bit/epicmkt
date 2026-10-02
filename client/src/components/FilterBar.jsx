import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faXmark } from "@fortawesome/free-solid-svg-icons";
import { COUNTIES } from "@epicmkt/shared";
import styles from "./FilterBar.module.css";

const SORT_OPTIONS = [
  { value: "relevance", label: "Best match" },
  { value: "rating", label: "Top rated" },
  { value: "newest", label: "Recently added" },
  { value: "distance", label: "Nearest" }
];

const RATING_OPTIONS = [
  { value: "0", label: "Any rating" },
  { value: "3", label: "3.0 & up" },
  { value: "4", label: "4.0 & up" },
  { value: "4.5", label: "4.5 & up" }
];

export default function FilterBar({ filters, onChange, onReset, active }) {
  return (
    <form className={styles.bar} role="search" aria-label="Filter businesses" onSubmit={(e) => e.preventDefault()}>
      <div className={styles.field}>
        <label htmlFor="f-county" className={styles.label}>
          County
        </label>
        <select id="f-county" className={styles.select} value={filters.county} onChange={(e) => onChange({ county: e.target.value })}>
          <option value="">All counties</option>
          {COUNTIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="f-rating" className={styles.label}>
          Rating
        </label>
        <select
          id="f-rating"
          className={styles.select}
          value={String(filters.minRating)}
          onChange={(e) => onChange({ minRating: e.target.value })}
        >
          {RATING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="f-sort" className={styles.label}>
          Sort by
        </label>
        <select id="f-sort" className={styles.select} value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.chip} ${filters.openNow ? styles.on : ""}`}
          aria-pressed={filters.openNow}
          onClick={() => onChange({ openNow: !filters.openNow })}
        >
          <FontAwesomeIcon icon={faClock} />
          Open now
        </button>
        {active && (
          <button type="button" className={styles.reset} onClick={onReset}>
            <FontAwesomeIcon icon={faXmark} />
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
