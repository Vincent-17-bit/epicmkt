import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { items, logEvent } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import { t } from "../i18n/index.js";
import HScroller from "./HScroller.jsx";
import ItemCard from "./ItemCard.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./SimilarItems.module.css";

const LIMIT = 12;
const MIN_SHOWN = 2;
const CELL = "clamp(150px, 42vw, 200px)";

// A position only nudges the order (nearer stores first), so a coarse key keeps the cache steady as it jitters.
const roundOf = (coords) =>
  coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? { lat: Math.round(coords.lat * 100) / 100, lng: Math.round(coords.lng * 100) / 100 } : null;

// "Similar items" under "More from this store": the same kind of product from other stores, best match first. It is a
// nicety, so a failed or thin result (fewer than two) removes the whole section instead of showing an error.
export default function SimilarItems({ itemId, businessId }) {
  const navigate = useNavigate();
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

  const open = (picked, index) => {
    logEvent("similar_item_click", { businessId, itemId, targetItemId: picked.id, targetBusinessId: picked.business.id, position: index + 1 });
    navigate(`/b/${picked.business.slug}/i/${encodeURIComponent(picked.id)}`);
  };

  return (
    <section className={styles.section} aria-labelledby="similar-items-title" data-similar="">
      <h3 id="similar-items-title" className={styles.title}>
        {t("item.similar")}
      </h3>
      <HScroller key={itemId} leftLabel={t("item.scrollLeft")} rightLabel={t("item.scrollRight")} busy={isPending} cellWidth={CELL} className={styles.scroller}>
        {isPending
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="12rem" radius="var(--radius-card)" />)
          : rows.map((row, index) => (
              <div key={row.id} className={styles.entry}>
                <ItemCard item={row} onSelect={(picked) => open({ ...picked, business: row.business }, index)} />
                <span className={styles.store}>{row.business.name}</span>
              </div>
            ))}
      </HScroller>
    </section>
  );
}
