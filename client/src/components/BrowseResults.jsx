import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders, faXmark } from "@fortawesome/free-solid-svg-icons";
import { getSearchFacets } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import { rotationSeed } from "../lib/rotation.js";
import { SORT_OPTIONS, applyFilters, buildChips, clearFilters, readFilters, toApiFilters } from "../lib/filters.js";
import BusinessResults from "./BusinessResults.jsx";
import FilterPanel from "./FilterPanel.jsx";
import FilterSheet from "./FilterSheet.jsx";
import styles from "./BrowseResults.module.css";

export default function BrowseResults({ query = "", categoryId = null }) {
  const [params, setParams] = useSearchParams();
  const geoStatus = useGeoStore((s) => s.status);
  const coords = useGeoStore((s) => s.coords);
  const requestGeo = useGeoStore((s) => s.request);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [total, setTotal] = useState(null);

  const filters = useMemo(() => readFilters(params), [params]);
  const needsGeo = filters.sort === "distance" || filters.radius > 0;

  const { data: facets } = useQuery({
    queryKey: ["facets", query, categoryId],
    queryFn: () => getSearchFacets({ query, categoryId }),
    staleTime: 5 * 60_000
  });

  const change = useCallback((patch) => setParams((prev) => applyFilters(prev, patch), { replace: true }), [setParams]);
  const clear = useCallback(() => setParams((prev) => clearFilters(prev), { replace: true }), [setParams]);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const chips = buildChips(filters, facets);
  const apiFilters = useMemo(() => toApiFilters(filters, coords, rotationSeed()), [filters, coords]);

  const geoNote = needsGeo && !coords ? (geoStatus === "asking" ? "Finding your location…" : "Set your location to sort and filter by distance.") : null;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Filters">
        <FilterPanel idPrefix="side" filters={filters} facets={facets} onChange={change} />
      </aside>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.filterBtn} onClick={() => setSheetOpen(true)}>
            <FontAwesomeIcon icon={faSliders} />
            Filters
            {chips.length > 0 && <span className={styles.badge}>{chips.length}</span>}
          </button>
          <div className={styles.sort}>
            <label htmlFor="sort-select" className={styles.sortLabel}>
              Sort by
            </label>
            <select id="sort-select" className={styles.select} value={filters.sort} onChange={(e) => change({ sort: e.target.value })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {geoNote && (
          <p className={styles.note} role="status">
            {geoNote}
            {geoStatus !== "asking" && (
              <>
                {" "}
                <button type="button" className={styles.noteBtn} onClick={requestGeo}>
                  Set location
                </button>
              </>
            )}
          </p>
        )}

        {chips.length > 0 && (
          <ul className={styles.chips} aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.id}>
                <button type="button" className={styles.chip} aria-label={`Remove filter: ${chip.label}`} onClick={() => change(chip.patch)}>
                  {chip.label}
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </li>
            ))}
            <li>
              <button type="button" className={styles.clear} onClick={clear}>
                Clear all
              </button>
            </li>
          </ul>
        )}

        <BusinessResults
          query={query}
          categoryId={categoryId}
          filters={apiFilters}
          onReset={chips.length > 0 ? clear : undefined}
          onTotal={setTotal}
          compact
        />
      </div>

      <FilterSheet open={sheetOpen} onClose={closeSheet} total={total} onClear={clear} canClear={chips.length > 0}>
        <FilterPanel idPrefix="sheet" filters={filters} facets={facets} onChange={change} />
      </FilterSheet>
    </div>
  );
}
