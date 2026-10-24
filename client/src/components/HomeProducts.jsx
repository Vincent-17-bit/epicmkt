import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders, faXmark } from "@fortawesome/free-solid-svg-icons";
import { getCategories, items } from "../api/index.js";
import { t } from "../i18n/index.js";
import { EMPTY_FILTERS, applyFilters, chipsOf, countActive, facetsOf, parseFilters, writeFilters } from "../lib/productFilters.js";
import Button from "./Button.jsx";
import Container from "./Container.jsx";
import Skeleton from "./Skeleton.jsx";
import ProductTile from "./ProductTile.jsx";
import FilterSheet from "./FilterSheet.jsx";
import ProductFilters from "./ProductFilters.jsx";
import styles from "./HomeProducts.module.css";

// A multiple of 2, 3, 4 and 6 so every row of the grid is full at every screen width.
export const PAGE_SIZE = 24;

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
  const [shown, setShown] = useState(PAGE_SIZE);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["all-products"], queryFn: () => items.getAll(), staleTime: 60_000 });
  const categories = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 60_000 });

  const filters = useMemo(() => parseFilters(params), [params]);
  const products = data ?? [];
  const towns = useMemo(() => facetsOf(products).towns, [products]);
  const results = useMemo(() => applyFilters(products, filters), [products, filters]);
  const active = countActive(filters);

  const categoryName = (id) => categories.data?.find((c) => c.id === id)?.name ?? id;
  const townName = (slug) => towns.find((x) => x.slug === slug)?.name ?? slug;
  const chips = chipsOf(filters, { categoryName, townName });

  const change = (patch) => {
    setParams(writeFilters(params, { ...filters, ...patch }), { replace: true, state: { keepScroll: true } });
  };
  const clear = () => change({ ...EMPTY_FILTERS, sort: filters.sort });

  const serialized = writeFilters(new URLSearchParams(), filters).toString();
  useEffect(() => setShown(PAGE_SIZE), [serialized]);

  if (!isPending && !isError && products.length === 0) return null;

  const visible = results.slice(0, shown);

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
            {results.length === 0 ? "No products match" : `${results.length} of ${products.length} products`}
          </p>
        )}

        {isError ? (
          <div className={styles.empty} role="alert">
            <p>{t("home.productsFailed")}</p>
            <Button variant="secondary" onClick={() => refetch()}>{t("home.productsRetry")}</Button>
          </div>
        ) : !isPending && results.length === 0 ? (
          <div className={styles.empty}>
            <p>No products match these filters.</p>
            <Button variant="secondary" onClick={clear}>Clear filters</Button>
          </div>
        ) : (
          <ul className={styles.grid} aria-busy={isPending} aria-label={isPending ? t("home.productsLoading") : undefined}>
            {isPending
              ? Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} />)
              : visible.map((item) => (
                  <li key={`${item.business?.id ?? item.businessId}:${item.id}`} className={styles.cell}>
                    <ProductTile item={item} />
                  </li>
                ))}
          </ul>
        )}

        {results.length > shown && (
          <div className={styles.more}>
            <Button variant="secondary" onClick={() => setShown((n) => n + PAGE_SIZE)}>
              {t("home.productsMore")}
            </Button>
          </div>
        )}
      </Container>

      <FilterSheet
        open={open}
        onClose={() => setOpen(false)}
        total={results.length}
        canClear={active > 0}
        onClear={clear}
        title="Filter products"
        noun={["product", "products"]}
        closeAbove="(min-width: 99999px)"
        className={styles.drawer}
      >
        <ProductFilters filters={filters} products={products} categories={categories.data ?? []} categoryName={categoryName} onChange={change} />
      </FilterSheet>
    </section>
  );
}
