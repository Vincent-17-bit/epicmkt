import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { flash, getCategories } from "../api/index.js";
import { useLiveSales } from "../hooks/useCountdown.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import Container from "../components/Container.jsx";
import FlashSaleCard from "../components/FlashSaleCard.jsx";
import FlashSkeleton from "../components/FlashSkeleton.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import CardGrid from "../components/CardGrid.jsx";
import styles from "./FlashSales.module.css";

const PAGE = 12;
const SORTS = ["ending", "discount", "nearest", "newest"];
const WINDOWS = ["", "1h", "24h"];

const number = (value) => {
  const n = Number(value);
  return value !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};

export default function FlashSales() {
  usePageTitle(t("flash.title"));
  const [params, setParams] = useSearchParams();
  const coords = useGeoStore((s) => s.coords);

  const category = params.get("category") ?? "";
  const town = params.get("town") ?? "";
  const endsWithin = WINDOWS.includes(params.get("within") ?? "") ? params.get("within") ?? "" : "";
  const min = params.get("min") ?? "";
  const max = params.get("max") ?? "";
  const sort = SORTS.includes(params.get("sort")) ? params.get("sort") : "ending";
  const active = Boolean(category || town || endsWithin || min || max);

  const set = (patch) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        return next;
      },
      { replace: true }
    );

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 5 * 60_000 });
  const { data: facets } = useQuery({ queryKey: ["flash-facets"], queryFn: flash.facets, staleTime: 30_000, refetchInterval: 60_000 });

  const query = useInfiniteQuery({
    queryKey: ["flash-page", category, town, endsWithin, min, max, sort, coords?.lat ?? null, coords?.lng ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      flash.list({
        categoryId: category || null,
        town: town || null,
        endsWithin: endsWithin || null,
        minPrice: number(min),
        maxPrice: number(max),
        sort,
        limit: PAGE,
        offset: pageParam,
        origin: coords ?? null
      }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  });

  const all = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const entries = useLiveSales(all);
  const total = query.data?.pages[0]?.total ?? 0;
  const categoryName = (id) => categories?.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <section className={styles.hero}>
        <Container>
          <PageBreadcrumbs />
          <div className={styles.heroInner}>
            <h1 className={styles.title}>
              <FontAwesomeIcon icon={faBolt} className={styles.bolt} aria-hidden="true" />
              {t("flash.title")}
              {facets && <span className={styles.count}>{facets.total} {t("flash.count")}</span>}
            </h1>
            <span className={styles.underline} aria-hidden="true" />
            <p className={styles.lead}>{t("flash.page.subtitle")}</p>
          </div>
        </Container>
      </section>

      <section className={styles.body}>
        <Container>
          <div className={styles.controls}>
            <label className={styles.field}>
              <span>{t("flash.filter.category")}</span>
              <select className={styles.control} value={category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">{t("flash.filter.all")}</option>
                {facets?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(c.id)} ({c.count})
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t("flash.filter.town")}</span>
              <select className={styles.control} value={town} onChange={(e) => set({ town: e.target.value })}>
                <option value="">{t("flash.filter.all")}</option>
                {facets?.towns.map((tw) => (
                  <option key={tw.slug} value={tw.slug}>
                    {tw.name} ({tw.count})
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.field}>
              <legend>{t("flash.filter.ending")}</legend>
              <div className={styles.segment}>
                {[
                  ["", t("flash.filter.any")],
                  ["1h", t("flash.filter.hour")],
                  ["24h", t("flash.filter.day")]
                ].map(([value, label]) => (
                  <button key={value} type="button" className={styles.seg} aria-pressed={endsWithin === value} onClick={() => set({ within: value })}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.field}>
              <legend>{t("flash.filter.price")}</legend>
              <div className={styles.range}>
                <input className={styles.control} type="number" inputMode="numeric" min="0" placeholder={t("flash.filter.min")} aria-label={t("flash.filter.min")} value={min} onChange={(e) => set({ min: e.target.value })} />
                <input className={styles.control} type="number" inputMode="numeric" min="0" placeholder={t("flash.filter.max")} aria-label={t("flash.filter.max")} value={max} onChange={(e) => set({ max: e.target.value })} />
              </div>
            </fieldset>
            <label className={styles.field}>
              <span>{t("flash.sort")}</span>
              <select className={styles.control} value={sort} onChange={(e) => set({ sort: e.target.value === "ending" ? "" : e.target.value })}>
                {SORTS.map((value) => (
                  <option key={value} value={value}>
                    {t(`flash.sort.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {active && (
            <button type="button" className={styles.clear} onClick={() => set({ category: "", town: "", within: "", min: "", max: "" })}>
              {t("flash.filter.clear")}
            </button>
          )}

          {query.isPending ? (
            <CardGrid aria-busy="true">
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i}>
                  <FlashSkeleton />
                </li>
              ))}
            </CardGrid>
          ) : query.isError ? (
            <div className={styles.message} role="alert">
              <p>{t("flash.loadFailed")}</p>
              <button type="button" className={styles.action} onClick={() => query.refetch()}>
                {t("flash.retry")}
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className={styles.message}>
              <p>{active ? t("flash.noMatch") : t("flash.empty")}</p>
            </div>
          ) : (
            <>
              <p className={styles.shown} aria-live="polite">
                {t("flash.shown")} {entries.length} {t("flash.of")} {total}
              </p>
              <CardGrid>
                {entries.map((entry) => (
                  <li key={entry.sale.id}>
                    <FlashSaleCard entry={entry} />
                  </li>
                ))}
              </CardGrid>
              {query.hasNextPage && (
                <div className={styles.more}>
                  <button type="button" className={styles.action} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                    {query.isFetchingNextPage ? t("flash.loading") : t("flash.loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </Container>
      </section>
    </>
  );
}
