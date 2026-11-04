import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { faTag } from "@fortawesome/free-solid-svg-icons";
import { offers, getCategories } from "../api/index.js";
import { useListingParams } from "../hooks/useListingParams.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import { Skeleton } from "@epicmkt/ui";
import OfferCard from "../components/OfferCard.jsx";
import ListingPage from "../components/ListingPage.jsx";
import styles from "./Offers.module.css";

const PAGE = 12;
const SORTS = ["ending", "nearest", "newest"];

export default function Offers() {
  usePageTitle(t("offers.title"));
  const [params, set] = useListingParams();
  const coords = useGeoStore((s) => s.coords);

  const category = params.get("category") ?? "";
  const town = params.get("town") ?? "";
  const sort = SORTS.includes(params.get("sort")) ? params.get("sort") : "ending";
  const active = Boolean(category || town);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 60_000 });
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
    <ListingPage
      icon={faTag}
      title={t("offers.title")}
      count={facets && `${facets.total} ${t("flash.count")}`}
      subtitle={t("offers.subtitle")}
      facets={facets}
      categoryName={categoryName}
      category={category}
      town={town}
      sort={sort}
      sorts={SORTS}
      onChange={set}
      active={active}
      onClear={() => set({ category: "", town: "" })}
      query={query}
      entries={entries}
      total={total}
      pending={
        <ul className={styles.grid} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton height="9rem" radius="var(--radius-card)" />
            </li>
          ))}
        </ul>
      }
      list={
        <ul className={styles.grid}>
          {entries.map((view) => (
            <li key={view.offer.id}>
              <OfferCard view={view} />
            </li>
          ))}
        </ul>
      }
      failedText={t("offers.loadFailed")}
      noMatchText={t("offers.noMatch")}
      emptyText={t("offers.empty")}
    />
  );
}
