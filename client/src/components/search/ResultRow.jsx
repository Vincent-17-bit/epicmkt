import { deliveryInfo } from "@epicmkt/shared";
import ProductTile from "../ProductTile.jsx";
import styles from "./ProductSearch.module.css";

const kes = (n) => Math.round(n).toLocaleString("en-KE");
export const itemHref = (item, valueId = null) => `/b/${item.business?.slug ?? item.businessSlug}/i/${encodeURIComponent(item.id)}${valueId ? `?v=${encodeURIComponent(valueId)}` : ""}`;

/** The delivery line, from the shop's own setting (shared/src/delivery.js reads every shape it comes in). Nothing is guessed. */
export function deliveryLine(business) {
  if (!business) return null;
  const d = deliveryInfo(business);
  if (d.offers) {
    const fee = d.fee === 0 ? "Free delivery" : Number.isFinite(d.fee) ? `Delivery KES ${kes(d.fee)}` : "Delivers";
    return { kind: "delivery", text: d.radiusKm ? `${fee} · ${d.radiusKm} km` : fee };
  }
  return { kind: "pickup", text: business.town ? `Pick up · ${business.town}` : "Pick up from the shop" };
}

/**
 * One search result: the site's product card, with what a buyer compares in search added from the item itself: its
 * facts ("Bluetooth · 60 W"), its colours, delivery or pick-up, and a "See options" / "View item" button. No cart.
 */
export default function ResultRow({ item, position, onOpen }) {
  return (
    <li className={styles.cell}>
      <ProductTile
        item={item}
        href={itemHref(item)}
        facts={item.search?.facts ?? null}
        swatches={item.swatches ?? null}
        delivery={deliveryLine(item.business)}
        cta={item.hasOptions ? "See options" : "View item"}
        titleLines={3}
        priority={position <= 4}
        onClick={() => onOpen?.(item, position)}
      />
    </li>
  );
}
