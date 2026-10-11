import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBorderAll, faFilter, faGrip, faList, faMagnifyingGlass, faPlus } from "@fortawesome/free-solid-svg-icons";
import { CATALOG_SORTS, activeChips } from "@epicmkt/shared";
import { useDebouncedSearch } from "./useCatalogView.js";
import styles from "./listings.module.css";

const MODE_ICONS = { comfortable: faBorderAll, compact: faGrip, list: faList };
const MODE_LABELS = { comfortable: "Comfortable grid", compact: "Compact grid", list: "List" };

export default function Toolbar({ view, onSearch, onSort, mode, onMode, onOpenFilters, onOpenViews, onOpenImport, importLocked, canAdd }) {
  const ref = useRef(null);
  const [text, setText] = useDebouncedSearch(view.q, onSearch);
  const filterCount = activeChips({ ...view, q: "" }).length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.toolbar} role="search">
      <label className={styles.search}>
        <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
        <input ref={ref} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, tags, section, description" aria-label="Search your items" aria-keyshortcuts="/" />
      </label>
      <label className={styles.sort}>
        <span className={styles.srOnly}>Sort by</span>
        <select value={view.sort} onChange={(e) => onSort(e.target.value)} aria-label="Sort by">
          {CATALOG_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <div className={styles.modes} role="group" aria-label="View mode">
        {Object.keys(MODE_ICONS).map((m) => (
          <button key={m} type="button" className={styles.modeBtn} aria-pressed={mode === m} onClick={() => onMode(m)} aria-label={MODE_LABELS[m]} title={MODE_LABELS[m]}>
            <FontAwesomeIcon icon={MODE_ICONS[m]} aria-hidden="true" />
          </button>
        ))}
      </div>
      <button type="button" className={`${styles.secondaryBtn} ${styles.filtersBtn}`} onClick={onOpenFilters}>
        <FontAwesomeIcon icon={faFilter} aria-hidden="true" />
        Filters{filterCount > 0 ? ` (${filterCount})` : ""}
      </button>
      <button type="button" className={styles.secondaryBtn} onClick={onOpenViews}>Saved views</button>
      <button type="button" className={styles.secondaryBtn} onClick={onOpenImport}>
        Import{importLocked ? " (Premium)" : ""}
      </button>
      {canAdd && (
        <Link to="/catalog/items/new" className={styles.primaryBtn}>
          <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
          Add item
        </Link>
      )}
    </div>
  );
}
