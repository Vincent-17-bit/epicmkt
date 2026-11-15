import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { items, logEvent } from "../api/index.js";
import { t } from "../i18n/index.js";
import ProductTile from "./ProductTile.jsx";
import { useNearViewport } from "../hooks/useNearViewport.js";
import { Skeleton } from "@epicmkt/ui";
import styles from "./GoesWith.module.css";

const PAGE_SIZE = 10;

/**
 * "Goes well with this" (C19): products that go with the one being viewed (a phone finds cases, screen protectors and chargers),
 * from any shop, at least 1 in 5 from this one (the ranking guarantees it; the card says "From this shop"). One page at a time with
 * "See more". It starts loading about a screen before it is reached; while the first page loads it holds the space the cards will
 * take; when there is nothing to suggest the section is not there at all. No reviews or ratings.
 */
export default function GoesWith({ itemId, businessId, className = "" }) {
  const marker = useRef(null);
  const near = useNearViewport(marker);
  const list = useRef(null);
  const [announce, setAnnounce] = useState("");
  const focusFrom = useRef(null);

  const query = useInfiniteQuery({
    queryKey: ["goes-with", itemId],
    queryFn: ({ pageParam, signal }) => items.getRelated(itemId, { page: pageParam, pageSize: PAGE_SIZE, signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last?.hasMore ? last.page + 1 : undefined),
    enabled: near,
    staleTime: 60_000,
    retry: false
  });

  const rows = (query.data?.pages ?? []).flatMap((p) => p.items ?? []).filter((row) => row?.id && row.business?.slug);

  // After "See more", keyboard and screen reader users land on the first new card, and hear how many arrived.
  useEffect(() => {
    if (focusFrom.current === null || query.isFetchingNextPage) return;
    const from = focusFrom.current;
    focusFrom.current = null;
    const added = rows.length - from;
    if (added > 0) {
      setAnnounce(t("item.moreLoaded").replace("{n}", String(added)));
      list.current?.querySelectorAll("[data-goes-with-entry] a")[from]?.focus();
    }
  }, [query.isFetchingNextPage, rows.length]);

  if (!near) return <div ref={marker} className={styles.marker} aria-hidden="true" data-goes-with-marker="" />;
  const loading = query.isPending;
  if (!loading && rows.length === 0) return null;

  const more = () => {
    focusFrom.current = rows.length;
    query.fetchNextPage();
  };
  const track = (picked, index) => () =>
    logEvent("related_item_click", { businessId, itemId, targetItemId: picked.id, targetBusinessId: picked.business.id, position: index + 1, fromThisShop: Boolean(picked.fromThisShop) });

  return (
    <section className={`${styles.section} ${className}`} aria-labelledby="goes-with-title" data-goes-with="" data-state={loading ? "loading" : "ready"} aria-busy={loading || query.isFetchingNextPage || undefined}>
      <div className={styles.heading}>
        <h3 id="goes-with-title" className={styles.title}>{t("item.goesWith")}</h3>
        <p className={styles.why}>{t("item.goesWithWhy")}</p>
      </div>
      <ul ref={list} className={styles.grid}>
        {loading
          ? Array.from({ length: 4 }, (_, i) => <li key={i}><Skeleton height="auto" radius="var(--radius-card)" className={styles.skeleton} /></li>)
          : rows.map((row, index) => (
              <li key={row.id} className={styles.entry} data-goes-with-entry="" onClick={track(row, index)}>
                <span className={styles.label}>{row.fromThisShop && <span className={styles.shopTag}>{t("item.fromThisShop")}</span>}</span>
                <ProductTile item={row} />
              </li>
            ))}
      </ul>
      {!loading && (
        <div className={styles.footer}>
          {query.hasNextPage ? (
            <button type="button" className={styles.more} onClick={more} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? t("item.seeMoreLoading") : t("item.seeMore")}
            </button>
          ) : (query.data?.pages?.length ?? 0) > 1 ? (
            <p className={styles.end}>{t("item.seenAll")}</p>
          ) : null}
        </div>
      )}
      <p className={styles.sr} role="status">{announce}</p>
    </section>
  );
}
