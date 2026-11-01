import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyseName } from "@epicmkt/shared";
import { items, logEvent } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import HScroller from "./HScroller.jsx";
import ProductTile from "./ProductTile.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./SimilarItems.module.css";

const LIMIT = 12;
const MIN_SHOWN = 2;
// Start fetching about a screen before the section is reached, so it is usually ready by the time it is scrolled to, and
// never competes with the item's own data or the first paint.
const ROOT_MARGIN = "600px 0px";
// Two cards and a peek of the third fit a phone; very small phones still show one and a half, so there is always a
// visible hint to swipe.
const CELL = "clamp(148px, 42vw, 220px)";

// A position only nudges the order (nearer stores first), so a coarse key keeps the cache steady as it jitters.
const roundOf = (coords) =>
  coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? { lat: Math.round(coords.lat * 100) / 100, lng: Math.round(coords.lng * 100) / 100 } : null;

// True once `ref` has come within ROOT_MARGIN of the viewport, and stays true. Without IntersectionObserver (very old browsers)
// it is true at once, so the row is never lost.
function useNearViewport(ref) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (near || !node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: ROOT_MARGIN }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, ref]);
  return near;
}

// "Similar items", the last section of the product page: the same KIND of product from other stores, best match first, as the
// same product cards the home page shows. It is a nicety, so a failed or thin result (fewer than two) renders nothing at all,
// not even an empty gap: until the section is near the screen it is only a zero-height marker, while it loads it holds the height
// the cards will take (no layout shift), and when there is nothing to show it is gone.
export default function SimilarItems({ itemId, businessId, name = "", brand = "", className = "" }) {
  const marker = useRef(null);
  const near = useNearViewport(marker);
  const origin = roundOf(useGeoStore((s) => s.coords));
  const key = origin ? `${origin.lat},${origin.lng}` : "";

  const { data, isPending } = useQuery({
    queryKey: ["similar-items", itemId, key],
    // The signal cancels the request when the visitor moves to another product before it finishes.
    queryFn: ({ signal }) => items.getSimilar(itemId, { limit: LIMIT, origin, signal }),
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
    <section className={`${styles.section} ${className}`} aria-labelledby="similar-items-title" data-similar="" data-state={isPending ? "loading" : "ready"}>
      <HScroller
        key={itemId}
        header={
          <div className={styles.heading}>
            <h3 id="similar-items-title" className={styles.title}>
              {t("item.similar")}
            </h3>
            {why && <p className={styles.why}>{why}</p>}
          </div>
        }
        leftLabel={t("item.scrollLeft")}
        rightLabel={t("item.scrollRight")}
        busy={isPending}
        cellWidth={CELL}
        className={styles.scroller}
      >
        {isPending
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="auto" radius="var(--radius-card)" className={styles.skeleton} />)
          : rows.map((row, index) => (
              <div key={row.id} className={styles.entry} onClick={track(row, index)}>
                <ProductTile item={row} />
              </div>
            ))}
      </HScroller>
    </section>
  );
}
