import { formatKes } from "@epicmkt/shared";
import { itemT } from "./labels.js";
import styles from "./ItemView.module.css";

// The Options slot as it is today: the single list of variants (item.pricing.variants) as a radio group. Renders nothing when there are none.
// The newer option axes (colour, size, storage...) are a different payload and are drawn by their own picker; this stays for items that have the old list.
export default function ItemOptions({ item, activeId = null, onVariant, t = itemT, money = formatKes }) {
  const variants = item.pricing?.variants ?? [];
  if (variants.length === 0) return null;
  return (
    <div role="radiogroup" aria-label={t("item.options")} className={styles.variants}>
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={v.id === activeId}
          className={`${styles.variant} ${v.id === activeId ? styles.selected : ""}`}
          onClick={() => onVariant?.(v.id)}
        >
          {v.label}
          {item.flash && <span className={styles.variantPrice}>{money(v.salePrice)}</span>}
        </button>
      ))}
    </div>
  );
}
