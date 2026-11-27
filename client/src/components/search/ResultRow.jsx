import { deliveryInfo } from "@epicmkt/shared";
import ProductTile from "../ProductTile.jsx";
import styles from "./ProductSearch.module.css";

const kes = (n) => Number(n).toLocaleString("en-KE", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
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

// A service is not picked up: it is done at the shop, or the shop comes to you.
function serviceLine(item) {
  const town = item.business?.town;
  if (item.search?.comesToYou) return { kind: "delivery", text: town ? `Comes to you · ${town}` : "Comes to you" };
  return { kind: "pickup", text: town ? `At the shop · ${town}` : "At the shop" };
}

/**
 * One search result: the site's product card, with what a buyer compares in search added from the item itself: its
 * facts ("Bluetooth · 60 W"), its colours, delivery or pick-up, and a "See options" / "View item" button. No cart.
 * Products and services are different listings: a service never shows stock ("Only 3 left" means nothing for a haircut),
 * and says where it is done instead of "Pick up".
 */
export default function ResultRow({ item, position, onOpen }) {
  const service = item.search?.listing === "service";
  const shown = service && (item.availability === "limited_stock" || item.stockLeft) ? { ...item, availability: "available", stockLeft: null } : item;
  return (
    <li className={styles.cell}>
      <ProductTile
        item={shown}
        href={itemHref(item)}
        facts={item.search?.facts ?? null}
        swatches={item.swatches ?? null}
        delivery={service ? serviceLine(item) : deliveryLine(item.business)}
        cta={item.hasOptions ? "See options" : service ? "View service" : "View item"}
        titleLines={3}
        priority={position <= 4}
        onClick={() => onOpen?.(item, position)}
      />
    </li>
  );
}
