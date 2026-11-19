import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { items as itemsApi, logEvent } from "../../api/index.js";
import { t } from "../../i18n/index.js";
import { useNearViewport } from "../../hooks/useNearViewport.js";
import { visitSeed } from "../../lib/visitSeed.js";
import RecoCarousel, { RecoCard } from "../RecoCarousel.jsx";
import SimilarItems from "../SimilarItems.jsx";
import StoreSelective from "../StoreSelective.jsx";
import styles from "../ItemDetail.module.css";
import rec from "./Recommend.module.css";

// Enough for the carousel's pages in one request; the ranking caps a page at 50.
const PAGE_SIZE = 48;

// Similar products: the same kind of product from other shops, right after "Goes well with this" and before What's included.
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

// "Goes well with this" (C19): products that COMPLETE this one (a soda or a juice with a pilau, a regulator with a gas cylinder),
// from any shop, at least 1 in 5 from this shop. One request per product per visit; the tab and the section share it.
export function useRelated(itemId, businessId, enabled = true) {
  const seed = visitSeed(itemId);
  return useQuery({
    queryKey: ["related-items", itemId, seed],
    queryFn: ({ signal }) => itemsApi.getRelated(itemId, { businessId, page: 1, pageSize: PAGE_SIZE, seed, signal }),
    enabled: enabled && Boolean(itemId),
    staleTime: 5 * 60_000,
    retry: false
  });
}

const rowsOf = (query) => (query.data?.items ?? []).filter((r) => r?.id && r.business?.slug);
const opened = (item) => (row, index) => logEvent("related_item_click", { itemId: item.id, targetItemId: row.id, position: index + 1, fromThisShop: Boolean(row.fromThisShop) });

/** The tab: the first five, and a link down to the section. Says so when nothing goes with this item. */
export function RecommendList({ ctx }) {
  const query = useRelated(ctx.item?.id, ctx.business?.id, true);
  if (!ctx.item) return null;
  const rows = rowsOf(query);
  if (query.isFetched && rows.length === 0) return <p className={rec.none}>{t("reco.nothing")}</p>;
  const open = opened(ctx.item);
  return (
    <>
      <ul className={rec.grid} aria-busy={query.isPending || undefined}>
        {query.isPending
          ? null
          : rows.slice(0, 5).map((row, index) => (
              <li key={row.id} className={rec.cell} onClick={() => open(row, index)}>
                <RecoCard item={row} />
              </li>
            ))}
      </ul>
      {rows.length > 5 && (
        <a className={rec.more} href="#item-recommend">
          {t("reco.seeAll")}
        </a>
      )}
    </>
  );
}

/** The section below the photos. Not there until it is near the screen, and not there at all when nothing goes with the item. */
export function RecommendSection({ ctx }) {
  const marker = useRef(null);
  const near = useNearViewport(marker);
  const query = useRelated(ctx.item?.id, ctx.business?.id, near);
  if (!ctx.item) return null;
  if (!near) return <div ref={marker} aria-hidden="true" data-goes-with-marker="" />;
  const rows = rowsOf(query);
  if (query.isFetched && rows.length === 0) return null;
  return (
    <RecoCarousel
      id="item-recommend"
      title={t("reco.goesWith")}
      note={t("reco.goesWithNote")}
      rows={rows}
      loading={query.isPending}
      onOpen={opened(ctx.item)}
      className={styles.similar}
      dataAttr={{ "data-goes-with": "", "data-state": query.isPending ? "loading" : "ready" }}
    />
  );
}
