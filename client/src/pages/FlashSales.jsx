import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { flash, getCategories } from "../api/index.js";
import { useLiveSales } from "../hooks/useCountdown.js";
import { useListingParams } from "../hooks/useListingParams.js";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import FlashSaleCard from "../components/FlashSaleCard.jsx";
import FlashSkeleton from "../components/FlashSkeleton.jsx";
import ListingPage from "../components/ListingPage.jsx";
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
  const [params, set] = useListingParams();
  const coords = useGeoStore((s) => s.coords);
  const online = useOnlineStatus();

  const category = params.get("category") ?? "";
  const town = params.get("town") ?? "";
  const endsWithin = WINDOWS.includes(params.get("within") ?? "") ? params.get("within") ?? "" : "";
  const min = params.get("min") ?? "";
  const max = params.get("max") ?? "";
  const openNow = params.get("open") === "1";
  const sort = SORTS.includes(params.get("sort")) ? params.get("sort") : "ending";
  const active = Boolean(category || town || endsWithin || min || max || openNow);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 60_000 });
  const { data: facets } = useQuery({ queryKey: ["flash-facets"], queryFn: flash.facets, staleTime: 30_000, refetchInterval: 60_000 });

  const query = useInfiniteQuery({
    queryKey: ["flash-page", category, town, endsWithin, min, max, openNow, sort, coords?.lat ?? null, coords?.lng ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      flash.list({
        categoryId: category || null,
        town: town || null,
        endsWithin: endsWithin || null,
        openNow,
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
    <ListingPage
      tone="flash"
      icon={faBolt}
      title={t("flash.title")}
      count={facets && `${facets.total} ${t("flash.count")}`}
      subtitle={t("flash.page.subtitle")}
      facets={facets}
      categoryName={categoryName}
      category={category}
      town={town}
      sort={sort}
      sorts={SORTS}
      onChange={set}
      extraFilters={
        <>
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
            <legend>{t("flash.filter.shop")}</legend>
            <div className={styles.segment}>
              {[
                ["", t("flash.filter.any")],
                ["1", t("flash.filter.openNow")]
              ].map(([value, label]) => (
                <button key={value} type="button" className={styles.seg} aria-pressed={(openNow ? "1" : "") === value} onClick={() => set({ open: value })}>
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
        </>
      }
      active={active}
      onClear={() => set({ category: "", town: "", within: "", min: "", max: "", open: "" })}
      query={query}
      entries={entries}
      total={total}
      online={online}
      offlineText={t("flash.offline")}
      pending={
        <CardGrid aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <FlashSkeleton />
            </li>
          ))}
        </CardGrid>
      }
      list={
        <CardGrid>
          {entries.map((entry) => (
            <li key={entry.sale.id}>
              <FlashSaleCard entry={entry} />
            </li>
          ))}
        </CardGrid>
      }
      failedText={t("flash.loadFailed")}
      noMatchText={t("flash.noMatch")}
      emptyText={t("flash.empty")}
    />
  );
}
