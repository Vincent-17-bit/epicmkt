import { useQuery } from "@tanstack/react-query";
import { items, logEvent } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import HScroller from "./HScroller.jsx";
import ProductTile from "./ProductTile.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./SimilarItems.module.css";

const LIMIT = 12;
const MIN_SHOWN = 2;
// Two cards and a peek of the third fit a phone; very small phones still show one and a half, so there is always a
// visible hint to swipe.
const CELL = "clamp(148px, 42vw, 220px)";

// A position only nudges the order (nearer stores first), so a coarse key keeps the cache steady as it jitters.
const roundOf = (coords) =>
  coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? { lat: Math.round(coords.lat * 100) / 100, lng: Math.round(coords.lng * 100) / 100 } : null;

// "Similar items" under "More from this store": the same kind of product from any other store, best match first, as
// the same product cards the home page shows. It is a
// nicety, so a failed or thin result (fewer than two) removes the whole section instead of showing an error.
export default function SimilarItems({ itemId, businessId }) {
  const origin = roundOf(useGeoStore((s) => s.coords));
  const key = origin ? `${origin.lat},${origin.lng}` : "";

  const { data, isPending } = useQuery({
    queryKey: ["similar-items", itemId, key],
    queryFn: () => items.getSimilar(itemId, { limit: LIMIT, origin }),
    staleTime: 60_000,
    retry: false
  });

  const rows = Array.isArray(data) ? data.filter((row) => row?.id && row.business?.slug) : [];
  if (!isPending && rows.length < MIN_SHOWN) return null;

  // The tile is a real link (open in a new tab, copy the address); the click is only counted, never intercepted.
  const track = (picked, index) => () =>
    logEvent("similar_item_click", { businessId, itemId, targetItemId: picked.id, targetBusinessId: picked.business.id, position: index + 1 });

  return (
    <section className={styles.section} aria-labelledby="similar-items-title" data-similar="">
      <HScroller
        key={itemId}
        header={
          <h3 id="similar-items-title" className={styles.title}>
            {t("item.similar")}
          </h3>
        }
        leftLabel={t("item.scrollLeft")}
        rightLabel={t("item.scrollRight")}
        busy={isPending}
        cellWidth={CELL}
        className={styles.scroller}
      >
        {isPending
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="15rem" radius="var(--radius-card)" />)
          : rows.map((row, index) => (
              <div key={row.id} className={styles.entry} onClick={track(row, index)}>
                <ProductTile item={row} />
              </div>
            ))}
      </HScroller>
    </section>
  );
}
