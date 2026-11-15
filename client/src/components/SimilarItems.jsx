import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyseName } from "@epicmkt/shared";
import { items, logEvent } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import { useNearViewport } from "../hooks/useNearViewport.js";
import RecoCarousel from "./RecoCarousel.jsx";
import { visitSeed } from "../lib/visitSeed.js";
import styles from "./SimilarItems.module.css";

const LIMIT = 24;
const MIN_SHOWN = 2;

// A position only nudges the order (nearer stores first), so a coarse key keeps the cache steady as it jitters.
const roundOf = (coords) =>
  coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? { lat: Math.round(coords.lat * 100) / 100, lng: Math.round(coords.lng * 100) / 100 } : null;


// "Similar products", the last section of the product page: the same KIND of product from other stores (white bread at one bakery
// finds white bread at another bakery or a supermarket; pilau at one cafe finds pilau at another), best match first, shown as the
// recommendation carousel. It is a nicety, so a failed or thin result (fewer than two) renders nothing at all,
// not even an empty gap: until the section is near the screen it is only a zero-height marker, while it loads it holds the height
// the cards will take (no layout shift), and when there is nothing to show it is gone.
export default function SimilarItems({ itemId, businessId, name = "", brand = "", className = "" }) {
  const marker = useRef(null);
  const near = useNearViewport(marker);
  const origin = roundOf(useGeoStore((s) => s.coords));
  const key = origin ? `${origin.lat},${origin.lng}` : "";
  // One seed per product per visit: equally good matches come in a different order on another visit, the same order on this one.
  const seed = visitSeed(itemId);

  const { data, isPending } = useQuery({
    queryKey: ["similar-items", itemId, key, seed],
    // The signal cancels the request when the visitor moves to another product before it finishes.
    queryFn: ({ signal }) => items.getSimilar(itemId, { limit: LIMIT, origin, seed, signal }),
    enabled: near,
    staleTime: 60_000,
    retry: false
  });

  if (!near) return <div ref={marker} className={styles.marker} aria-hidden="true" data-similar-marker="" />;

  const rows = Array.isArray(data) ? data.filter((row) => row?.id && row.business?.slug) : [];
  if (!isPending && rows.length < MIN_SHOWN) return null;

  // Say WHY these are here, but only when the product is one the vocabulary really knows ("Galaxy" would read badly).
  const kind = analyseName(name, brand);
  const why = kind.known && kind.headWord ? t("item.similarWhy").replace("{what}", kind.headWord) : "";

  // The tile is a real link (open in a new tab, copy the address); the click is only counted, never intercepted.
  const track = (picked, index) => () =>
    logEvent("similar_item_click", { businessId, itemId, targetItemId: picked.id, targetBusinessId: picked.business.id, position: index + 1 });

  return (
    <RecoCarousel
      key={itemId}
      id="item-similar"
      title={t("item.similar")}
      note={why}
      rows={rows}
      loading={isPending}
      onOpen={(row, index) => track(row, index)()}
      className={className}
      dataAttr={{ "data-similar": "", "data-state": isPending ? "loading" : "ready" }}
    />
  );
}
