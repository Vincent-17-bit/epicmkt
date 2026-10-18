import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { items } from "../../api/index.js";
import { useFlashStrip } from "../../hooks/useFlashSales.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { useGeoStore } from "../../stores/geo.js";
import { t } from "../../i18n/index.js";
import FlashStrip from "../FlashStrip.jsx";
import ItemCard from "../ItemCard.jsx";
import StoreSelective, { storeSelectiveOptions } from "../StoreSelective.jsx";
import styles from "./item.module.css";

const SIMILAR_DESKTOP = 6;

export default function ItemMore({ item, track, onState }) {
  const seller = item.business;
  const desktop = useMediaQuery("(min-width: 1024px)");
  const coords = useGeoStore((s) => s.coords);
  const selective = useQuery(storeSelectiveOptions(seller.id, item.id));
  const flash = useFlashStrip({ limit: 11 });
  const similar = useQuery({
    queryKey: ["item-similar", seller.slug, item.id],
    queryFn: () => items.getSimilar(item.id, { businessId: seller.slug, limit: 12, origin: coords ?? null }),
    staleTime: 30_000
  });

  const hasSelective = selective.isPending || (selective.data?.length ?? 0) >= 2;
  const hasFlash = flash.isPending || flash.isError || flash.entries.some((entry) => !(entry.item.id === item.id && entry.business.id === seller.id));
  const hasSimilar = similar.isPending || (similar.data?.length ?? 0) > 0;
  const empty = !hasSelective && !hasFlash && !hasSimilar;

  useEffect(() => {
    onState?.(empty ? "empty" : "ready");
  }, [empty]);

  if (empty) return null;

  const similarItems = similar.data ?? [];
  const shown = desktop ? similarItems.slice(0, SIMILAR_DESKTOP) : similarItems;

  return (
    <section id="item-more" className={`${styles.card} ${styles.more}`} aria-labelledby="item-more-title">
      <h2 id="item-more-title" className={`${styles.h2} ${styles.moreTitle}`}>
        {t("item.section.more")}
      </h2>
      {hasSelective && (
        <StoreSelective
          businessId={seller.id}
          businessSlug={seller.slug}
          excludeItemId={item.id}
          onSelect={(next, index) => track("store_selective_click", { targetItemId: next.id, position: index + 1 })}
          onSeeAll={() => track("store_selective_click", { target: "see_all" })}
        />
      )}
      {hasFlash && <FlashStrip id="item-more-flash" heat={false} heading={t("item.otherFlash")} exclude={{ itemId: item.id, businessId: seller.id }} size="compact" />}
      {hasSimilar && (
        <section className={styles.similar} aria-labelledby="item-similar-title" aria-busy={similar.isPending}>
          <h3 id="item-similar-title" className={styles.h3}>
            {t("item.similar")}
          </h3>
          <ul className={styles.similarList}>
            {similar.isPending
              ? Array.from({ length: 4 }, (_, i) => <li key={i} className={`${styles.similarCell} ${styles.similarSkeleton}`} />)
              : shown.map((entry, index) => (
                  <li key={`${entry.businessSlug}/${entry.id}`} className={styles.similarCell}>
                    <ItemCard item={entry} onSelect={() => track("similar_item_click", { targetItemId: entry.id, position: index + 1 })} />
                  </li>
                ))}
          </ul>
        </section>
      )}
    </section>
  );
}
