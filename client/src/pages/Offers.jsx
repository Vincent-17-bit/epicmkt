import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag } from "@fortawesome/free-solid-svg-icons";
import { offers, getCategories } from "../api/index.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import Container from "../components/Container.jsx";
import OfferCard from "../components/OfferCard.jsx";
import Skeleton from "../components/Skeleton.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import styles from "./Offers.module.css";

const PAGE = 12;
const SORTS = ["ending", "nearest", "newest"];

export default function Offers() {
  usePageTitle(t("offers.title"));
  const [params, setParams] = useSearchParams();
  const coords = useGeoStore((s) => s.coords);

  const category = params.get("category") ?? "";
  const town = params.get("town") ?? "";
  const sort = SORTS.includes(params.get("sort")) ? params.get("sort") : "ending";
  const active = Boolean(category || town);

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
  const { data: facets } = useQuery({ queryKey: ["offer-facets"], queryFn: offers.facets, staleTime: 30_000, refetchInterval: 60_000 });

  const query = useInfiniteQuery({
    queryKey: ["offers-page", category, town, sort, coords?.lat ?? null, coords?.lng ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      offers.list({ categoryId: category || null, town: town || null, sort, limit: PAGE, offset: pageParam, origin: coords ?? null }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  });

  const entries = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const categoryName = (id) => categories?.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <Container className={styles.crumbRow}>
        <PageBreadcrumbs />
      </Container>
      <section className={styles.hero}>
        <Container>
          <div className={styles.heroInner}>
            <h1 className={styles.title}>
              <FontAwesomeIcon icon={faTag} aria-hidden="true" />
              {t("offers.title")}
              {facets && <span className={styles.count}>{facets.total} {t("flash.count")}</span>}
            </h1>
            <p className={styles.lead}>{t("offers.subtitle")}</p>
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
            <button type="button" className={styles.clear} onClick={() => set({ category: "", town: "" })}>
              {t("flash.filter.clear")}
            </button>
          )}

          {query.isPending ? (
            <ul className={styles.grid} aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i}>
                  <Skeleton height="9rem" radius="var(--radius-card)" />
                </li>
              ))}
            </ul>
          ) : query.isError ? (
            <div className={styles.message} role="alert">
              <p>{t("offers.loadFailed")}</p>
              <button type="button" className={styles.action} onClick={() => query.refetch()}>
                {t("flash.retry")}
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className={styles.message}>
              <p>{active ? t("offers.noMatch") : t("offers.empty")}</p>
            </div>
          ) : (
            <>
              <p className={styles.shown} aria-live="polite">
                {t("flash.shown")} {entries.length} {t("flash.of")} {total}
              </p>
              <ul className={styles.grid}>
                {entries.map((view) => (
                  <li key={view.offer.id}>
                    <OfferCard view={view} />
                  </li>
                ))}
              </ul>
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
