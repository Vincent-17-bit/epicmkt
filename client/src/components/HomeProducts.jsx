import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders, faXmark } from "@fortawesome/free-solid-svg-icons";
import { getCategories, items } from "../api/index.js";
import { t } from "../i18n/index.js";
import { EMPTY_FILTERS, chipsOf, countActive, parseFilters, writeFilters } from "../lib/productFilters.js";
import { PAGE_SIZE } from "../lib/productQuery.js";
import { countsFromJson } from "../lib/productQuery.js";
import Button from "./Button.jsx";
import Container from "./Container.jsx";
import Skeleton from "./Skeleton.jsx";
import ProductTile from "./ProductTile.jsx";
import FilterSheet from "./FilterSheet.jsx";
import ProductFilters from "./ProductFilters.jsx";
import styles from "./HomeProducts.module.css";

// A multiple of 2, 3, 4 and 6 so every row of the grid is full at every screen width.
export { PAGE_SIZE };

function TileSkeleton() {
  return (
    <li className={styles.cell} aria-hidden="true">
      <div className={styles.skeleton}>
        <Skeleton width="100%" height="100%" radius="0" />
      </div>
    </li>
  );
}

export default function HomeProducts() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  const filters = useMemo(() => parseFilters(params), [params]);
  const serialized = writeFilters(new URLSearchParams(), filters).toString();

  // The server answers one page at a time (and the CDN caches each answer). While a new filter is loading, the grid keeps
  // showing the previous products instead of flashing back to skeletons.
  const pages = useInfiniteQuery({
    queryKey: ["products-page", serialized],
    queryFn: ({ pageParam }) => items.getPage(filters, { page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 60_000
  });
  const { data, isPending, isError, refetch, isPlaceholderData, hasNextPage, fetchNextPage, isFetchingNextPage } = pages;
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

  const last = data?.pages[data.pages.length - 1];
  const visible = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const total = last?.total ?? 0;
  const catalogTotal = last?.catalogTotal ?? 0;
  const towns = facets.data?.towns ?? [];
  const active = countActive(filters);

  const categoryName = (id) => categories.data?.find((c) => c.id === id)?.name ?? id;
  const townName = (slug) => towns.find((x) => x.slug === slug)?.name ?? slug;
  const chips = chipsOf(filters, { categoryName, townName });

  const change = (patch) => {
    setParams(writeFilters(params, { ...filters, ...patch }), { replace: true, state: { keepScroll: true } });
  };
  const clear = () => change({ ...EMPTY_FILTERS, sort: filters.sort });

  if (!isPending && !isError && catalogTotal === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="home-products-title">
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
          <ul className={styles.grid} aria-busy={isPending || isPlaceholderData} aria-label={isPending ? t("home.productsLoading") : undefined}>
            {isPending
              ? Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} />)
              : visible.map((item) => (
                  <li key={`${item.business?.id ?? item.businessId}:${item.id}`} className={styles.cell}>
                    <ProductTile item={item} />
                  </li>
                ))}
          </ul>
        )}

        {hasNextPage && !isPlaceholderData && (
          <div className={styles.more}>
            <Button variant="secondary" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {t("home.productsMore")}
            </Button>
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
        <ProductFilters filters={filters} facets={facets.data} counts={counts.data ? countsFromJson(counts.data) : null} categories={categories.data ?? []} categoryName={categoryName} onChange={change} />
      </FilterSheet>
    </section>
  );
}
