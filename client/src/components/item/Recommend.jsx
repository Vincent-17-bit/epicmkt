import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Skeleton } from "@epicmkt/ui";
import { items as itemsApi, logEvent } from "../../api/index.js";
import ProductTile from "../ProductTile.jsx";
import SimilarItems from "../SimilarItems.jsx";
import StoreSelective from "../StoreSelective.jsx";
import styles from "../ItemDetail.module.css";
import rec from "./Recommend.module.css";

const PAGE_SIZE = 10;

// Similar items: the last section of the page, after the details, description, highlights, specs and the seller card.
// The caller keys it by the item so one product's results can never show under another.
export default function Recommend({ ctx }) {
  const { item, business } = ctx;
  if (!item) return null;
  return <SimilarItems itemId={item.id} businessId={business.id} name={item.name} brand={item.brand ?? ""} className={styles.similar} />;
}

// More from this store. Shown in the loading and gone states too, and after the description when the item is there.
export function StoreMore({ ctx }) {
  const { business, itemId, track, onSelect } = ctx;
  return (
    <StoreSelective
      businessId={business.id}
      businessSlug={business.slug}
      excludeItemId={itemId}
      onSelect={(next, index) => {
        track("store_selective_click", { targetItemId: next.id, position: index + 1 });
        onSelect(next.id);
      }}
      onSeeAll={() => track("store_selective_click", { target: "see_all" })}
    />
  );
}

// Load only once the section is about a screen away, so the item's own data and first paint never wait for it.
function useNear(ref) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (near || !node) return undefined;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "600px 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, [near, ref]);
  return near;
}

export function useRelated(itemId, businessId, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["related-items", itemId],
    queryFn: ({ pageParam, signal }) => itemsApi.getRelated(itemId, { businessId, page: pageParam, pageSize: PAGE_SIZE, signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last?.hasMore ? last.page + 1 : undefined),
    enabled: enabled && Boolean(itemId),
    staleTime: 60_000,
    retry: false
  });
}

/**
 * "Recommended": products that go with this one (a soundbar for a TV, cables and a case for a phone), from any shop, at least
 * 1 in 5 from the shop being viewed (labelled "From this shop"), with "See more" for the next page (C19). `compact` is the
 * Recommended tab: the first five and a link down to the section.
 */
function Cards({ ctx, query, compact, loading }) {
  const { item } = ctx;
  const rows = (query.data?.pages ?? []).flatMap((p) => p.items ?? []).filter((r) => r?.id && r.business?.slug);
  const shown = compact ? rows.slice(0, 5) : rows;
  const open = (row, index) => () => logEvent("related_item_click", { itemId: item.id, targetItemId: row.id, position: index + 1, fromThisShop: Boolean(row.fromThisShop) });
  return (
    <>
      <ul className={rec.grid} aria-busy={loading || query.isFetchingNextPage ? "true" : undefined}>
        {loading
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <Skeleton height="16rem" radius="var(--radius-card)" />
              </li>
            ))
          : shown.map((row, index) => (
              <li key={row.id} className={rec.cell} onClick={open(row, index)}>
                {row.fromThisShop && <span className={rec.mine}>From this shop</span>}
                <ProductTile item={row} />
              </li>
            ))}
      </ul>
      {compact ? (
        rows.length > 5 && (
          <a className={rec.more} href="#item-recommend">
            See all recommended items
          </a>
        )
      ) : query.hasNextPage ? (
        <button type="button" className={rec.more} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? "Loading…" : "See more"}
        </button>
      ) : rows.length > PAGE_SIZE ? (
        <p className={rec.end}>That is everything we can suggest for now.</p>
      ) : null}
    </>
  );
}

const countOf = (query) => (query.data?.pages ?? []).reduce((n, p) => n + (p.items?.length ?? 0), 0);

export function RecommendList({ ctx, compact = false }) {
  const query = useRelated(ctx.item?.id, ctx.business?.id, true);
  if (!ctx.item) return null;
  if (query.isFetched && countOf(query) === 0) return <p className={rec.none}>Nothing to suggest for this item yet.</p>;
  return <Cards ctx={ctx} query={query} compact={compact} loading={query.isPending} />;
}

export function RecommendSection({ ctx }) {
  const marker = useRef(null);
  const near = useNear(marker);
  const query = useRelated(ctx.item?.id, ctx.business?.id, near);
  if (!ctx.item) return null;
  // Until it is near the screen it is a zero-height marker; when there is nothing to suggest it is gone.
  if (!near) return <div ref={marker} aria-hidden="true" />;
  if (query.isFetched && countOf(query) === 0) return null;
  return (
    <section id="item-recommend" className={rec.section} aria-labelledby="recommend-title">
      <h3 id="recommend-title" className={rec.title}>Recommended with this item</h3>
      <p className={rec.note}>Products that go with it, from shops across EpicMKT.</p>
      <Cards ctx={ctx} query={query} compact={false} loading={query.isPending} />
    </section>
  );
}
