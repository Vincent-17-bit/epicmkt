import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faMagnifyingGlass, faSliders, faXmark } from "@fortawesome/free-solid-svg-icons";
import { EMPTY_SEARCH, SEARCH_SORTS, parseSearch, writeSearch } from "@epicmkt/shared";
import { Container, Skeleton } from "@epicmkt/ui";
import { searchCatalog } from "../api/products/search.js";
import { logEvent } from "../api/index.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useNoindex } from "../hooks/useRouteSeo.js";
import { FOCUSABLE_WITH_FIELDS, useFocusTrap } from "../hooks/useFocusTrap.js";
import FilterSidebar from "../components/search/FilterSidebar.jsx";
import ResultRow from "../components/search/ResultRow.jsx";
import styles from "../components/search/ProductSearch.module.css";

const FIELD_OF = { brand: "brands", colour: "colours", condition: "conditions", deals: "deals", shop: "shops", town: "towns", store: "store" };

const activeCount = (s) =>
  (s.kind ? 1 : 0) + s.brands.length + s.colours.length + s.conditions.length + s.deals.length + s.shops.length + s.towns.length + s.store.length +
  (s.delivery ? 1 : 0) + (s.price || s.min !== null || s.max !== null ? 1 : 0) + Object.values(s.facets).reduce((n, v) => n + v.length, 0);

/** /products?q=speakers: Amazon-style results with the filters that fit what was found. Nothing to buy here: rows open the item. */
export default function ProductSearch() {
  const [params, setParams] = useSearchParams();
  const search = useMemo(() => parseSearch(params), [params]);
  const key = writeSearch(search).toString();
  const [drawer, setDrawer] = useState(false);
  const top = useRef(null);
  usePageTitle(search.q ? `${search.q}: products` : "Products");
  useNoindex(true);

  const { data, isPending, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: ["product-search", key],
    queryFn: () => searchCatalog(search),
    placeholderData: keepPreviousData,
    staleTime: 30_000
  });

  useEffect(() => {
    if (search.q) logEvent("product_search", { q: search.q.slice(0, 80) });
  }, [search.q]);

  const go = (next, { keepPage = false } = {}) => {
    const merged = { ...search, ...next, page: keepPage ? (next.page ?? search.page) : 1 };
    setParams(writeSearch(merged));
    if (keepPage) top.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const toggle = (facetId, valueId) => {
    if (facetId === "delivery") return go({ delivery: !search.delivery });
    const field = FIELD_OF[facetId];
    if (field) {
      const list = search[field];
      return go({ [field]: list.includes(valueId) ? list.filter((v) => v !== valueId) : [...list, valueId] });
    }
    const list = search.facets[facetId] ?? [];
    return go({ facets: { ...search.facets, [facetId]: list.includes(valueId) ? list.filter((v) => v !== valueId) : [...list, valueId] } });
  };
  const clear = () => go({ ...EMPTY_SEARCH, q: search.q, sort: search.sort, facets: {} });
  const count = activeCount(search);

  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const chips = data ? chipsOf(data.facets, search) : [];

  const sidebar = data ? (
    <FilterSidebar
      facets={data.facets}
      search={search}
      onToggle={toggle}
      onKind={(kind) => go({ kind, facets: {} })}
      onPrice={(p) => go(p)}
      onClear={clear}
      activeCount={count}
    />
  ) : null;

  return (
    <div className={styles.page} ref={top}>
      <div className={styles.strip}>
        <Container className={styles.stripInner}>
          <p className={styles.summary} aria-live="polite">
            {isPending ? "Searching…" : data.total === 0 ? (
              <>No results for <span className={styles.term}>“{search.q || "everything"}”</span></>
            ) : (
              <>
                {from}-{to} of {data.total > 100 ? `over ${Math.floor(data.total / 100) * 100}` : data.total} results{search.q ? <> for <span className={styles.term}>“{search.q}”</span></> : null}
              </>
            )}
          </p>
          <div className={styles.stripTools}>
            <button type="button" className={styles.filtersBtn} onClick={() => setDrawer(true)} aria-haspopup="dialog">
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
          <div className={styles.tabs} role="navigation" aria-label="What to search">
            <span className={styles.tabOn} aria-current="page">Products</span>
            <Link to={`/search?q=${encodeURIComponent(search.q)}`} className={styles.tab}>Businesses</Link>
          </div>
          {chips.length > 0 && (
            <ul className={styles.chips} aria-label="Filters in use">
              {chips.map((c) => (
                <li key={c.key}>
                  <button type="button" className={styles.chip} onClick={() => (c.kind ? go({ kind: "", facets: {} }) : c.price ? go({ price: "", min: null, max: null }) : toggle(c.facet, c.value))} aria-label={`Remove ${c.label}`}>
                    {c.label} <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li><button type="button" className={styles.clearLink} onClick={clear}>Clear all</button></li>
            </ul>
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
              <h2>No products match {count ? "these filters" : `“${search.q}”`}</h2>
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
              <ol className={styles.list}>
                {data.items.map((item, i) => (
                  <ResultRow key={item.id} item={item} position={(data.page - 1) * data.pageSize + i + 1} onOpen={(it, pos) => logEvent("product_search_open", { itemId: it.id, position: pos })} />
                ))}
              </ol>
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
              {data.pages > 1 && <Pager page={data.page} pages={data.pages} onPage={(page) => go({ page }, { keepPage: true })} />}
            </>
          )}
        </section>
      </Container>

      {drawer && data && (
        <FilterDrawer onClose={() => setDrawer(false)} total={data.total}>
          {sidebar}
        </FilterDrawer>
      )}
    </div>
  );
}

function chipsOf(facets, search) {
  const out = [];
  for (const f of facets) {
    if (f.type === "links") {
      const on = f.values.find((v) => v.selected);
      if (on) out.push({ key: `k-${on.id}`, label: on.label, kind: true });
    } else if (f.type === "price") {
      const on = f.values.find((v) => v.selected);
      if (on) out.push({ key: "price", label: on.label, price: true });
    } else {
      for (const v of f.values.filter((x) => x.selected)) out.push({ key: `${f.id}-${v.id}`, label: f.id === "delivery" ? v.label : `${f.label}: ${v.label}`, facet: f.id, value: v.id });
    }
  }
  if (!search.price && (search.min !== null || search.max !== null)) {
    out.push({ key: "price-own", label: `KES ${search.min ?? 0} to ${search.max ?? "any"}`, price: true });
  }
  return out;
}

function Pager({ page, pages, onPage }) {
  const nums = [...new Set([1, 2, 3, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const items = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) items.push(`gap-${n}`);
    items.push(n);
  });
  return (
    <nav className={styles.pager} aria-label="Result pages">
      <button type="button" className={styles.pageNav} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /> Previous
      </button>
      {items.map((n) =>
        typeof n === "string" ? (
          <span key={n} className={styles.gap} aria-hidden="true">…</span>
        ) : (
          <button key={n} type="button" className={n === page ? styles.pageOn : styles.pageBtn} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => onPage(n)}>
            {n}
          </button>
        )
      )}
      <button type="button" className={styles.pageNav} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
      </button>
    </nav>
  );
}

function FilterDrawer({ onClose, total, children }) {
  const ref = useRef(null);
  useFocusTrap({ active: true, getContainer: () => ref.current, onEscape: onClose, selector: FOCUSABLE_WITH_FIELDS, wrapFromOutside: true });
  useEffect(() => {
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("button")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);
  return (
    <div className={styles.drawerScrim} onClick={onClose}>
      <div ref={ref} className={styles.drawer} role="dialog" aria-modal="true" aria-label="Filters" onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerHead}>
          <h2>Filters</h2>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close filters">
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.drawerBody}>{children}</div>
        <div className={styles.drawerFoot}>
          <button type="button" className={styles.cta} onClick={onClose}>Show {total} result{total === 1 ? "" : "s"}</button>
        </div>
      </div>
    </div>
  );
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

const ResultsSkeleton = () => (
  <ol className={styles.list} aria-hidden="true">
    {[0, 1, 2, 3].map((i) => (
      <li key={i} className={styles.row}>
        <div className={styles.media}><Skeleton width="100%" height="100%" /></div>
        <div className={styles.body}>
          <Skeleton width="70%" height="1.2rem" />
          <Skeleton width="90%" height=".9rem" />
          <Skeleton width="30%" height="1.6rem" />
        </div>
      </li>
    ))}
  </ol>
);
