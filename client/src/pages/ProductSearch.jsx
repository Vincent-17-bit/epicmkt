import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp, faMagnifyingGlass, faSliders, faTableCellsLarge, faXmark } from "@fortawesome/free-solid-svg-icons";
import { EMPTY_SEARCH, SEARCH_SORTS, parseSearch, writeSearch } from "@epicmkt/shared";
import { Container, Skeleton } from "@epicmkt/ui";
import { searchCatalog } from "../api/products/search.js";
import { logEvent } from "../api/index.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useNoindex } from "../hooks/useRouteSeo.js";
import { useOpenSearch } from "../hooks/useOpenSearch.js";
import FilterSidebar, { FacetBody } from "../components/search/FilterSidebar.jsx";
import FilterSheet from "../components/FilterSheet.jsx";
import ResultRow from "../components/search/ResultRow.jsx";
import Pagination from "../components/Pagination.jsx";
import styles from "../components/search/ProductSearch.module.css";

// Shallow on purpose, like the 7 pages Amazon shows for a keyword: past this the shopper is better served by a filter.
export const MAX_SEARCH_PAGES = 20;

// Loading, in layers (the same as the home grid, docs/catalog-scale.md): one page of 16 at a time, each its own cached
// question; near the end of the list (IntersectionObserver, about a screen ahead, never a scroll listener) the next page is
// fetched in the background and the first AUTO_PAGES are added on their own; after that "Load more" adds one page per tap
// (already fetched, so instant); page links jump straight to a page (?page=) and Back works. 180 results or ten million,
// the page never holds more than MAX_SEARCH_PAGES pages, and only the pages asked for are ever fetched.
const AUTO_PAGES = 2;
const NEAR = "900px 0px";

const FIELD_OF = { brand: "brands", colour: "colours", condition: "conditions", deals: "deals", shop: "shops", town: "towns", county: "counties", store: "store", avail: "avail" };

const activeCount = (s) =>
  (s.kind ? 1 : 0) + s.brands.length + s.colours.length + s.conditions.length + s.deals.length + s.shops.length + s.towns.length + s.counties.length + s.store.length + s.avail.length +
  (s.delivery ? 1 : 0) + (s.freeDelivery ? 1 : 0) + (s.price || s.min !== null || s.max !== null ? 1 : 0) +
  Object.values(s.facets).reduce((n, v) => n + v.length, 0) + Object.values(s.ranges).filter(Boolean).length;

// How far the visitor had loaded this list (pages 3, 4 ... after "Load more"), so Back from an item comes back to it.
const endKey = (key) => `epicmkt:search-end:${key}`;
function readEnd(key, start) {
  try {
    const n = Number(sessionStorage.getItem(endKey(key)));
    return Number.isInteger(n) && n > start && n <= MAX_SEARCH_PAGES ? n : start;
  } catch {
    return start;
  }
}
function saveEnd(key, end) {
  try {
    sessionStorage.setItem(endKey(key), String(end));
  } catch {
    /* private mode: the list simply starts at its first page again */
  }
}

// Calls `onNear` whenever `ref` comes within NEAR of the viewport, and once more each time `deps` change while it is near.
function useNear(ref, onNear, deps) {
  const latest = useRef(onNear);
  latest.current = onNear;
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) latest.current();
    }, { rootMargin: NEAR });
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** /products?q=speakers: Amazon-style results with the filters that fit what was found. Nothing to buy here: cards open the item. */
export default function ProductSearch() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const openSearch = useOpenSearch();
  const search = useMemo(() => parseSearch(params), [params]);
  const listKey = writeSearch({ ...search, page: 1 }).toString();
  const start = Math.min(search.page, MAX_SEARCH_PAGES);
  const [sheet, setSheet] = useState(false);
  const [panel, setPanel] = useState(null);
  const top = useRef(null);
  usePageTitle(search.q ? `${search.q}: products` : "Products");
  useNoindex(true);

  // The pages on screen: from `start` (the page the visitor jumped to) to `end`. A new search starts over.
  const shownKey = `${listKey}|${start}`;
  const [shown, setShown] = useState(() => ({ key: shownKey, end: readEnd(shownKey, start) }));
  const end = shown.key === shownKey ? shown.end : readEnd(shownKey, start);
  const setEnd = (next) => {
    setShown({ key: shownKey, end: next });
    saveEnd(shownKey, next);
  };

  const pageQuery = (n) => ({
    queryKey: ["product-search-items", listKey, n],
    queryFn: () => searchCatalog({ ...search, page: n }, { itemsOnly: true }),
    staleTime: 60_000
  });
  // The first page brings the filters too; while a new search loads, the old results stay instead of flashing to skeletons.
  const first = useQuery({
    queryKey: ["product-search", listKey, start],
    queryFn: () => searchCatalog({ ...search, page: start }),
    placeholderData: keepPreviousData,
    staleTime: 30_000
  });
  const more = useQueries({ queries: Array.from({ length: Math.max(0, end - start) }, (_, i) => pageQuery(start + 1 + i)) });
  const { data, isPending, isError, refetch, isPlaceholderData } = first;

  useEffect(() => {
    if (search.q) logEvent("product_search", { q: search.q.slice(0, 80) });
  }, [search.q]);

  // A link to page 15 of a search that now has 3 pages lands on page 3, and the address says so.
  useEffect(() => {
    if (data && !isPlaceholderData && data.page < start) setParams(writeSearch({ ...search, page: data.page }), { replace: true });
  }, [data, isPlaceholderData, start, search, setParams]);

  // Every result once, even if a page boundary moved between two requests (at most 320 cards: cheap to rebuild).
  const visible = [];
  const seen = new Set();
  for (const page of [data, ...more.map((q) => q.data)]) {
    for (const item of page?.items ?? []) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        visible.push(item);
      }
    }
  }
  const pageSize = data?.pageSize ?? 16;
  const pages = data ? Math.min(data.pages, MAX_SEARCH_PAGES) : 1;
  const loadingMore = more.some((q) => q.isPending);
  const moreFailed = more.find((q) => q.isError);
  const canMore = Boolean(data) && !isPlaceholderData && end < pages;
  const deep = data ? data.total > pages * pageSize : false;

  // Near the end: fetch the next page ahead, and add it by itself for the first AUTO_PAGES pages.
  const sentinel = useRef(null);
  useNear(
    sentinel,
    () => {
      if (!canMore || loadingMore || moreFailed) return;
      queryClient.prefetchQuery(pageQuery(end + 1));
      if (end - start < AUTO_PAGES) setEnd(end + 1);
    },
    [end, start, canMore, loadingMore, listKey]
  );

  const announce = useRef(null);
  useEffect(() => {
    if (end > start && announce.current && data) announce.current.textContent = `${visible.length} more results shown`;
  }, [visible.length, end, start, data]);

  const scrollTop = () => top.current?.scrollIntoView?.({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const go = (next, { keepPage = false } = {}) => {
    const merged = { ...search, ...next, page: keepPage ? (next.page ?? search.page) : 1 };
    setParams(writeSearch(merged));
    if (keepPage) scrollTop();
  };
  const toggle = (facetId, valueId) => {
    logEvent("product_search_filter", { facet: facetId, kind: search.kind || data?.facets?.find((f) => f.kind)?.kind || "" });
    if (facetId === "delivery") return go(valueId === "free" ? { freeDelivery: !search.freeDelivery } : { delivery: !search.delivery });
    const field = FIELD_OF[facetId];
    if (field) {
      const list = search[field];
      return go({ [field]: list.includes(valueId) ? list.filter((v) => v !== valueId) : [...list, valueId] });
    }
    const list = search.facets[facetId] ?? [];
    // A range ticked from the list replaces the shopper's own min and max for that filter, and the other way round.
    const { [facetId]: _own, ...ranges } = search.ranges;
    return go({ facets: { ...search.facets, [facetId]: list.includes(valueId) ? list.filter((v) => v !== valueId) : [...list, valueId] }, ranges });
  };
  const setRange = (facetId, range) => {
    const { [facetId]: _old, ...ranges } = search.ranges;
    go({ ranges: range ? { ...ranges, [facetId]: range } : ranges, facets: { ...search.facets, [facetId]: [] } });
  };
  const handlers = {
    onToggle: toggle,
    onKind: (kind) => go({ kind, facets: {}, ranges: {} }),
    onPrice: (p) => go(p),
    onRange: setRange
  };
  const clear = () => go({ ...EMPTY_SEARCH, q: search.q, sort: search.sort, type: search.type, facets: {}, ranges: {} });
  const setType = (type) => go({ type, kind: "", facets: {}, ranges: {} });
  const goToPage = (n) => go({ page: n }, { keepPage: true });
  const count = activeCount(search);

  const facets = data?.facets ?? [];
  const chips = data ? chipsOf(facets, search) : [];
  const quick = (data?.quick ?? []).map((id) => facets.find((f) => f.id === id)).filter(Boolean);
  const panelFacet = panel ? facets.find((f) => f.id === panel) : null;

  const from = data && data.total ? (start - 1) * pageSize + 1 : 0;
  const to = data ? Math.min(data.total, (start - 1) * pageSize + visible.length) : 0;
  const shownTotal = data ? (data.total > 100 ? `over ${(Math.floor(data.total / 100) * 100).toLocaleString("en-KE")}` : data.total.toLocaleString("en-KE")) : "";
  const listing = data?.listing ?? { product: 0, service: 0 };
  const split = (listing.product > 0 && listing.service > 0) || Boolean(search.type);

  const sidebar = data ? <FilterSidebar facets={facets} search={search} handlers={handlers} onClear={clear} activeCount={count} /> : null;

  return (
    <div className={styles.page} ref={top}>
      <div className={styles.strip}>
        <Container className={styles.stripInner}>
          <p className={styles.summary} aria-live="polite">
            {isPending ? "Searching…" : !data || data.total === 0 ? (
              <>No results for <span className={styles.term}>“{search.q || "everything"}”</span></>
            ) : (
              <>
                {from.toLocaleString("en-KE")}-{to.toLocaleString("en-KE")} of {shownTotal} results{search.q ? <> for <span className={styles.term}>“{data.corrected ?? search.q}”</span></> : null}
              </>
            )}
          </p>
          <div className={styles.stripTools}>
            <button type="button" className={styles.filtersBtn} onClick={() => setSheet(true)} aria-haspopup="dialog">
              <FontAwesomeIcon icon={faSliders} aria-hidden="true" /> Filters{count ? ` (${count})` : ""}
            </button>
            <label className={styles.sort}>
              <span>Sort by:</span>
              <select value={search.sort} onChange={(e) => go({ sort: e.target.value })}>
                {SEARCH_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
        </Container>
      </div>

      <Container className={styles.layout}>
        <aside className={styles.side} aria-label="Filters">{isPending ? <SidebarSkeleton /> : sidebar}</aside>

        <section className={styles.results} aria-label="Search results" data-loading={isPlaceholderData ? "" : undefined}>
          <nav className={styles.tabs} aria-label="What to search">
            {split ? (
              <>
                <TypeTab on={!search.type} onClick={() => setType("")} label="All" n={listing.product + listing.service} />
                <TypeTab on={search.type === "product"} onClick={() => setType("product")} label="Products" n={listing.product} />
                <TypeTab on={search.type === "service"} onClick={() => setType("service")} label="Services" n={listing.service} />
              </>
            ) : (
              <span className={styles.tabOn} aria-current="page">{listing.service > 0 && !listing.product ? "Services" : "Products"}</span>
            )}
            <Link to={`/search?q=${encodeURIComponent(search.q)}`} className={styles.tab}>Businesses</Link>
          </nav>

          {quick.length > 0 && (
            <div className={styles.quick}>
              <ul className={styles.quickRow} aria-label="Top filters">
                {quick.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={styles.quickChip}
                      data-on={quickOn(f, search) ? "" : undefined}
                      aria-expanded={panel === f.id}
                      aria-controls="quick-panel"
                      onClick={() => setPanel((p) => (p === f.id ? null : f.id))}
                    >
                      {quickLabel(f, search)}
                      <FontAwesomeIcon icon={panel === f.id ? faChevronUp : faChevronDown} aria-hidden="true" />
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className={styles.quickAll} onClick={() => setSheet(true)} aria-haspopup="dialog">
                    <FontAwesomeIcon icon={faSliders} aria-hidden="true" /> All filters{count ? ` (${count})` : ""}
                  </button>
                </li>
              </ul>
              {panelFacet && (
                <div id="quick-panel" className={styles.quickPanel} role="region" aria-label={`${panelFacet.label} filter`} onKeyDown={(e) => e.key === "Escape" && setPanel(null)}>
                  <div className={styles.quickPanelHead}>
                    <h3 className={styles.groupTitle}>{panelFacet.label}</h3>
                    <button type="button" className={styles.quickDone} onClick={() => setPanel(null)}>Done</button>
                  </div>
                  <FacetBody facet={panelFacet} search={search} handlers={handlers} compact />
                </div>
              )}
            </div>
          )}

          {chips.length > 0 && (
            <ul className={styles.chips} aria-label="Filters in use">
              {chips.map((c) => (
                <li key={c.key}>
                  <button type="button" className={styles.chip} onClick={() => c.remove(handlers, go, search)} aria-label={`Remove ${c.label}`}>
                    {c.label} <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li><button type="button" className={styles.clearLink} onClick={clear}>Clear all</button></li>
            </ul>
          )}

          {data?.corrected && data.corrected !== search.q && (
            <p className={styles.resultsNote} role="status">
              Showing results for <strong>{data.corrected}</strong>. No products matched “{search.q}”.
            </p>
          )}
          {isPending ? (
            <ResultsSkeleton />
          ) : isError ? (
            <div className={styles.empty}>
              <h2>We could not load the results</h2>
              <p>Check your connection and try again.</p>
              <button type="button" className={styles.cta} onClick={() => refetch()}>Try again</button>
            </div>
          ) : data.total === 0 ? (
            <div className={styles.empty}>
              <h2>No {search.type === "service" ? "services" : "products"} match {count ? "these filters" : `“${search.q}”`}</h2>
              <p>{count ? "Remove a filter or two to see more." : "Check the spelling, try a shorter word, or look for a shop that sells it."}</p>
              <div className={styles.emptyActions}>
                {count > 0 && <button type="button" className={styles.cta} onClick={clear}>Clear all filters</button>}
                <Link className={styles.ctaGhost} to={`/search?q=${encodeURIComponent(search.q)}`}>Search businesses instead</Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className={styles.resultsTitle}>Results</h2>
              <p className={styles.resultsNote}>Prices, stock and delivery are set by each shop. Open an item to pick options and chat with the seller.</p>
              <ol className={styles.list} aria-busy={isPlaceholderData || loadingMore}>
                {visible.map((item, i) => (
                  <ResultRow key={item.id} item={item} position={(start - 1) * pageSize + i + 1} onOpen={(it, pos) => logEvent("product_search_open", { itemId: it.id, position: pos })} />
                ))}
                {loadingMore && Array.from({ length: 4 }, (_, i) => <CardSkeleton key={`more-${i}`} />)}
              </ol>

              <div ref={sentinel} className={styles.sentinel} aria-hidden="true" />
              <p ref={announce} className="sr-only" aria-live="polite" />

              <div className={styles.footer}>
                {pages > 1 && (
                  <p className={styles.progress}>
                    Showing {from.toLocaleString("en-KE")}–{to.toLocaleString("en-KE")} of {Math.min(data.total, pages * pageSize).toLocaleString("en-KE")}
                  </p>
                )}
                {moreFailed ? (
                  <div className={styles.moreError} role="alert">
                    <span>We could not load more results.</span>
                    <button type="button" className={styles.cta} onClick={() => moreFailed.refetch()}>Try again</button>
                  </div>
                ) : canMore ? (
                  <button type="button" className={styles.moreBtn} disabled={loadingMore} onClick={() => setEnd(end + 1)}>
                    {loadingMore ? "Loading…" : "Load more results"}
                  </button>
                ) : (
                  (pages > 1 || deep) && (
                    <div className={styles.endCard}>
                      <p className={styles.endTitle}>{deep ? "That’s as deep as the results go" : "You’ve seen every result"}</p>
                      <p className={styles.endText}>
                        {deep ? "There are more. A filter or a more exact word will bring the rest to the top." : "Try a filter, another word or a category to find more."}
                      </p>
                      <div className={styles.endActions}>
                        <button type="button" className={styles.cta} onClick={() => setSheet(true)}>
                          <FontAwesomeIcon icon={faSliders} aria-hidden="true" /> Filters
                        </button>
                        <button type="button" className={styles.cta} onClick={openSearch}>
                          <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" /> Search again
                        </button>
                        <Link className={styles.cta} to="/#categories">
                          <FontAwesomeIcon icon={faTableCellsLarge} aria-hidden="true" /> Categories
                        </Link>
                      </div>
                    </div>
                  )
                )}
                <Pagination className={styles.pagerSpace} page={start} to={end} pages={pages} onPage={goToPage} label="Result pages" />
              </div>

              {data.related?.length > 0 && (
                <section className={styles.related} aria-labelledby="related-title">
                  <h2 id="related-title" className={styles.relatedTitle}>Related searches</h2>
                  <ul className={styles.relatedGrid}>
                    {data.related.map((q) => (
                      <li key={q}>
                        <Link to={`/products?q=${encodeURIComponent(q)}`} className={styles.relatedItem}>
                          <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" /> {q}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </section>
      </Container>

      <FilterSheet
        open={sheet && Boolean(data)}
        onClose={() => setSheet(false)}
        total={data?.total ?? null}
        canClear={count > 0}
        onClear={clear}
        title="Filters"
        noun={["result", "results"]}
        verb="Apply"
        closeAbove="(min-width: 99999px)"
      >
        {sidebar}
      </FilterSheet>
    </div>
  );
}

function TypeTab({ on, onClick, label, n }) {
  return (
    <button type="button" className={on ? styles.tabOn : styles.tab} aria-pressed={on} onClick={onClick}>
      {label} <span className={styles.tabCount}>{n.toLocaleString("en-KE")}</span>
    </button>
  );
}

const quickOn = (f, search) =>
  f.values?.some((v) => v.selected) || Boolean(f.range) || (f.type === "price" && (search.price || search.min !== null || search.max !== null));

// "Size", "Size: M", "Size (2)", "Weight: 0.5 to 2 kg": the chip says what is picked.
function quickLabel(f, search) {
  const picked = (f.values ?? []).filter((v) => v.selected);
  if (f.type === "price" && (search.min !== null || search.max !== null) && !search.price) return `Price: ${priceText(search)}`;
  if (f.range) return `${f.label}: ${f.range.text}`;
  if (picked.length === 1) return `${f.label}: ${picked[0].label}`;
  if (picked.length > 1) return `${f.label} (${picked.length})`;
  return f.label;
}
const priceText = (s) => (s.min !== null && s.max !== null ? `KES ${s.min.toLocaleString("en-KE")} to ${s.max.toLocaleString("en-KE")}` : s.min !== null ? `From KES ${s.min.toLocaleString("en-KE")}` : `Up to KES ${s.max.toLocaleString("en-KE")}`);

// The filters in use, each a chip that takes itself off.
function chipsOf(facets, search) {
  const out = [];
  for (const f of facets) {
    if (f.type === "links") {
      const on = f.values.find((v) => v.selected);
      if (on) out.push({ key: `k-${on.id}`, label: on.label, remove: (h) => h.onKind("") });
    } else if (f.type === "price") {
      const on = f.values.find((v) => v.selected);
      if (on) out.push({ key: "price", label: on.label, remove: (h) => h.onPrice({ price: "", min: null, max: null }) });
    } else {
      for (const v of f.values.filter((x) => x.selected)) {
        out.push({ key: `${f.id}-${v.id}`, label: f.toggle ? v.label : `${f.label}: ${v.label}`, remove: (h) => h.onToggle(f.id, v.id) });
      }
      if (f.range) out.push({ key: `${f.id}-own`, label: `${f.label}: ${f.range.text}`, remove: (h) => h.onRange(f.id, null) });
    }
  }
  if (!search.price && (search.min !== null || search.max !== null)) {
    out.push({ key: "price-own", label: priceText(search), remove: (h) => h.onPrice({ price: "", min: null, max: null }) });
  }
  return out;
}

const SidebarSkeleton = () => (
  <div className={styles.filters} aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <div key={i} className={styles.group}>
        <Skeleton width="50%" height="1rem" />
        {[0, 1, 2, 3].map((j) => <Skeleton key={j} width="80%" height=".9rem" />)}
      </div>
    ))}
  </div>
);

const CardSkeleton = () => (
  <li className={styles.cell} aria-hidden="true">
    <div className={styles.cardSkeleton}>
      <Skeleton width="100%" height="100%" radius="0" />
    </div>
  </li>
);

const ResultsSkeleton = () => (
  <ol className={styles.list} aria-hidden="true">
    {Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
  </ol>
);
