import { stockTag } from "@epicmkt/shared";
import styles from "./StockTag.module.css";

export const STOCK_LABELS = { lowStock: "Low stock", onlyLeft: "Only {n} left" };

// A small amber tag for an item that is running low: "Low stock", or "Only 3 left" when the shop shares the number.
// An item that is available has nothing to say, so this renders nothing for it. Sold-out items are not listed to
// customers at all, so there is no tag for them either.
export default function StockTag({ item, labels = STOCK_LABELS, className = "", onPicture = false, lifted = false }) {
  const text = stockTag(item, {
    low: labels.lowStock ?? STOCK_LABELS.lowStock,
    only: (n) => (labels.onlyLeft ?? STOCK_LABELS.onlyLeft).replace("{n}", n)
  });
  if (!text) return null;
  return (
    <span className={`${styles.tag} ${onPicture ? styles.onPicture : ""} ${className}`} data-stock-tag="" data-lifted={lifted ? "" : undefined}>
      <svg className={styles.icon} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
        <path d="M2.5 5.2 8 2.5l5.5 2.7v5.6L8 13.5l-5.5-2.7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6v2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="10.6" r=".9" fill="currentColor" />
      </svg>
      <span className={styles.text}>{text}</span>
    </span>
  );
}
