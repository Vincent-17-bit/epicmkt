import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faSliders, faTableCellsLarge, faXmark } from "@fortawesome/free-solid-svg-icons";
import { getCategories, items } from "../api/index.js";
import { t } from "../i18n/index.js";
import { EMPTY_FILTERS, chipsOf, countActive, parseFilters, writeFilters } from "../lib/productFilters.js";
import { FEED_MAX_PAGES, PAGE_SIZE, countsFromJson, pageSizeFor } from "../lib/productQuery.js";
import { feedVisit } from "../lib/feedEpoch.js";
import { useOpenSearch } from "../hooks/useOpenSearch.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { useStableList } from "../hooks/useStableList.js";
import { Button, Container, Skeleton } from "@epicmkt/ui";
import ProductTile from "./ProductTile.jsx";
import Pagination from "./Pagination.jsx";
import FilterSheet from "./FilterSheet.jsx";
import ProductFilters from "./ProductFilters.jsx";
import { sizeNameFrom } from "../lib/sizeFilterLabels.js";
import { chooseShoeSystem, readShoeSystem, saveShoeSystem } from "../lib/shoeSystem.js";
import styles from "./HomeProducts.module.css";

// A page is about 50 cards, sized to the screen's column count (lib/productQuery.js GRID_PAGE_SIZES) so every row is full.
export { PAGE_SIZE };

// Loading, in layers (docs/catalog-scale.md):
//   * one page (about 50 cards, by screen) at a time, each its own cached question (the CDN answers repeats; React Query keeps visited pages);
//   * near the end of the grid (IntersectionObserver, about one screen ahead, never a scroll listener) the next page is fetched
//     in the background, and the first AUTO_PAGES are added on their own;
//   * after that a "Show more" button adds one page per tap (already fetched, so it is instant), and the footer stays reachable;
//   * page links jump straight to a page (?ppage=), so a long list never has to be scrolled through, and Back works;
//   * the list is shallow: FEED_MAX_PAGES pages at most. At the end the visitor is offered search, filters and categories.
const AUTO_PAGES = 2;
const NEAR = "900px 0px";

const pageOfParam = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, FEED_MAX_PAGES) : 1;
};
const keyOf = (item) => `${item.business?.id ?? item.businessId}:${item.id}`;

function TileSkeleton() {
  return (
    <li className={styles.cell} aria-hidden="true">
      <div className={styles.skeleton}>
        <Skeleton width="100%" height="100%" radius="0" />
      </div>
    </li>
  );
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

export default function HomeProducts() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const openSearch = useOpenSearch();
  const [open, setOpen] = useState(false);
  // The buyer's shoe size system (remembered on this device). It only changes how shoe sizes are written in the filters.
  const [shoeBuyer, setShoeBuyer] = useState(() => readShoeSystem());
  const shoeSystem = chooseShoeSystem(shoeBuyer, null);
  const onShoeSystem = (id) => {
    setShoeBuyer(id);
    saveShoeSystem(id);
  };

  // The grid's columns follow these breakpoints (HomeProducts.module.css); a page holds a whole number of rows of them.
  const wide = useMediaQuery("(min-width: 78rem)");
  const tablet = useMediaQuery("(min-width: 46rem)");
  const small = useMediaQuery("(min-width: 34rem)");
  const pageSize = pageSizeFor(wide ? 6 : tablet ? 4 : small ? 3 : 2);

  const filters = useMemo(() => parseFilters(params), [params]);
  const serialized = writeFilters(new URLSearchParams(), filters).toString();
  // The visit's rotation hour and variant: the recommended order is frozen for this visit, however long the visitor pages through it.
  const [visit] = useState(() => feedVisit());
  const recommended = filters.sort === "recommended";
  const hour = recommended ? visit.epoch : null;
  const variant = recommended ? visit.variant : null;
  const start = pageOfParam(params.get("ppage"));

  // The pages on screen: from `start` (the page the visitor jumped to, 1 by default) to `end`. A new list starts over.
  const listKey = `${serialized}|${start}|${pageSize}`;
  const [shown, setShown] = useState({ key: listKey, end: start });
  const end = shown.key === listKey ? shown.end : start;
  const setEnd = (next) => setShown({ key: listKey, end: next });

  const pageQuery = (n) => ({
    queryKey: ["products-page", serialized, hour, variant, pageSize, n],
    queryFn: () => items.getPage(filters, { page: n, pageSize, ...(hour === null ? {} : { epoch: hour, variant }) }),
    staleTime: 5 * 60_000
  });
  // While a new filter loads, the grid keeps the previous products instead of flashing back to skeletons.
  const first = useQuery({ ...pageQuery(start), placeholderData: keepPreviousData });
  const more = useQueries({ queries: Array.from({ length: Math.max(0, end - start) }, (_, i) => pageQuery(start + 1 + i)) });

  const facets = useQuery({ queryKey: ["products-facets"], queryFn: () => items.getFacets(), staleTime: 5 * 60_000 });
  const categories = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 60_000 });
  // Live option counts are only needed while the filter sheet is open.
  const counts = useQuery({
    queryKey: ["products-counts", serialized],
    queryFn: () => items.getCounts(filters),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 60_000
  });

  const { data, isPending, isError, refetch, isPlaceholderData } = first;
  // Every product once, even if a page boundary moved between two requests (at most 192 cards: cheap to rebuild).
  const fresh = [];
  const seenKeys = new Set();
  for (const page of [data, ...more.map((q) => q.data)]) {
    for (const item of page?.items ?? []) {
      const key = keyOf(item);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        fresh.push(item);
      }
    }
  }
  // Whatever a refetch brings, what is on screen stays where it is.
  const visible = useStableList(listKey, fresh, keyOf);
  const loadingMore = more.some((q) => q.isPending);
  const moreFailed = more.find((q) => q.isError);
  const total = data?.total ?? 0;
  const catalogTotal = data?.catalogTotal ?? 0;
  const pages = data?.pages ?? Math.max(1, Math.ceil(total / pageSize));
  const capped = data?.capped === true;
  const canMore = !isPlaceholderData && end < pages;
  const towns = facets.data?.towns ?? [];
  const active = countActive(filters);

  // Near the end: fetch the next page ahead, and add it by itself for the first AUTO_PAGES pages.
  const sentinel = useRef(null);
  useNear(
    sentinel,
    () => {
      if (!canMore || loadingMore || moreFailed) return;
      queryClient.prefetchQuery(pageQuery(end + 1));
      if (end - start < AUTO_PAGES) setEnd(end + 1);
    },
    [end, start, canMore, loadingMore, serialized]
  );

  const top = useRef(null);
  const announce = useRef(null);
  useEffect(() => {
    if (end > start && announce.current) announce.current.textContent = `${Math.min(visible.length, total)} of ${Math.min(total, pages * pageSize)} products shown`;
  }, [visible.length, end, start, total, pages, pageSize]);

  const categoryName = (id) => categories.data?.find((c) => c.id === id)?.name ?? id;
  const townName = (slug) => towns.find((x) => x.slug === slug)?.name ?? slug;
  const brandName = (slug) => facets.data?.brands?.find((x) => x.slug === slug)?.name ?? slug;
  const chips = chipsOf(filters, { categoryName, townName, brandName, sizeName: sizeNameFrom(facets.data?.sizes, shoeSystem) });

  const change = (patch) => {
    const next = writeFilters(params, { ...filters, ...patch });
    next.delete("ppage");
    setParams(next, { replace: true, state: { keepScroll: true } });
  };
  const clear = () => change({ ...EMPTY_FILTERS, sort: filters.sort });
  const goToPage = (n) => {
    const next = new URLSearchParams(params);
    if (n <= 1) next.delete("ppage");
    else next.set("ppage", String(n));
    setParams(next, { state: { keepScroll: true } });
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

  if (!isPending && !isError && catalogTotal === 0) return null;

  const from = total ? (start - 1) * pageSize + 1 : 0;
  const to = Math.min(total, (start - 1) * pageSize + visible.length);
  const reachable = Math.min(total, pages * pageSize);

  return (
    <section className={styles.section} aria-labelledby="home-products-title" ref={top}>
      <Container>
        <div className={styles.head}>
          <h2 id="home-products-title" className={styles.heading}>
            {t("home.products")}
          </h2>
          {!isPending && !isError && (
            <button type="button" className={styles.filterBtn} data-active={active > 0 || undefined} aria-haspopup="dialog" onClick={() => setOpen(true)}>
              <FontAwesomeIcon icon={faSliders} aria-hidden="true" />
              <span>Filters</span>
              {active > 0 && <span className={styles.badge} aria-label={`${active} active`}>{active}</span>}
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <ul className={styles.chips} aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button type="button" className={styles.chip} onClick={() => change(chip.clear(filters))} aria-label={`Remove filter: ${chip.label}`}>
                  {chip.label}
                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <button type="button" className={styles.clearAll} onClick={clear}>Clear all</button>
            </li>
          </ul>
        )}

        {active > 0 && !isPending && !isError && (
          <p className={styles.found} role="status" aria-live="polite">
            {total === 0 ? "No products match" : `${total} of ${catalogTotal} products`}
          </p>
        )}

        {isError ? (
          <div className={styles.empty} role="alert">
            <p>{t("home.productsFailed")}</p>
            <Button variant="secondary" onClick={() => refetch()}>{t("home.productsRetry")}</Button>
          </div>
        ) : !isPending && total === 0 ? (
          <div className={styles.empty}>
            <p>No products match these filters.</p>
            <Button variant="secondary" onClick={clear}>Clear filters</Button>
          </div>
        ) : (
          <ul className={styles.grid} aria-busy={isPending || isPlaceholderData || loadingMore} aria-label={isPending ? t("home.productsLoading") : undefined}>
            {isPending
              ? Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} />)
              : visible.map((item) => (
                  <li key={keyOf(item)} className={styles.cell}>
                    <ProductTile item={item} />
                  </li>
                ))}
            {loadingMore && Array.from({ length: 6 }, (_, i) => <TileSkeleton key={`more-${i}`} />)}
          </ul>
        )}

        <div ref={sentinel} className={styles.sentinel} aria-hidden="true" />
        <p ref={announce} className="sr-only" aria-live="polite" />

        {!isPending && !isError && total > 0 && (
          <div className={styles.footer}>
            {pages > 1 && (
              <p className={styles.progress}>
                Showing {from.toLocaleString("en-KE")}–{to.toLocaleString("en-KE")} of {reachable.toLocaleString("en-KE")}
              </p>
            )}
            {moreFailed ? (
              <div className={styles.moreError} role="alert">
                <span>{t("home.productsFailed")}</span>
                <Button size="sm" variant="secondary" onClick={() => moreFailed.refetch()}>{t("home.productsRetry")}</Button>
              </div>
            ) : canMore ? (
              <Button variant="secondary" className={styles.moreBtn} disabled={loadingMore} onClick={() => setEnd(end + 1)}>
                {loadingMore ? t("home.productsLoadingMore") : t("home.productsMore")}
              </Button>
            ) : (
              pages > 1 && (
                <div className={styles.endCard}>
                  <p className={styles.endTitle}>{capped ? "That’s the top of the list for now" : "You’ve seen them all"}</p>
                  <p className={styles.endText}>
                    {capped ? "There’s plenty more. Search, filter or pick a category to find exactly what you need." : "Search or browse a category to discover more."}
                  </p>
                  <div className={styles.endActions}>
                    <Button size="sm" icon={faMagnifyingGlass} onClick={openSearch}>Search products</Button>
                    <Button size="sm" variant="secondary" icon={faSliders} onClick={() => setOpen(true)}>Filters</Button>
                    <Button size="sm" variant="secondary" as={Link} to="/#categories" icon={faTableCellsLarge}>Categories</Button>
                  </div>
                </div>
              )
            )}
            <Pagination pages={pages} page={start} to={end} onPage={goToPage} label="Product pages" />
          </div>
        )}
      </Container>

      <FilterSheet
        open={open}
        onClose={() => setOpen(false)}
        total={total}
        canClear={active > 0}
        onClear={clear}
        title="Filter products"
        noun={["product", "products"]}
        closeAbove="(min-width: 99999px)"
        className={styles.drawer}
      >
        <ProductFilters filters={filters} facets={facets.data} counts={counts.data ? countsFromJson(counts.data) : null} categories={categories.data ?? []} categoryName={categoryName} onChange={change} shoeSystem={shoeSystem} onShoeSystem={onShoeSystem} />
      </FilterSheet>
    </section>
  );
}
