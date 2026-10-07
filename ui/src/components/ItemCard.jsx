import { formatKes } from "@epicmkt/shared";
import { labels } from "../labels.js";
import AvailabilityDot from "./AvailabilityDot.jsx";
import styles from "./ItemCard.module.css";

export default function ItemCard({ item, onSelect, renderFlash, className = "" }) {
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  const availability = item.availability ?? "available";

  return (
    <button
      type="button"
      data-card=""
      className={`${styles.card} ${className}`}
      onClick={() => onSelect?.(item)}
      aria-haspopup="dialog"
    >
      <span className={styles.media}>
        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className={styles.img} draggable="false" />}
        {onSale && <span className={styles.chip}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && renderFlash?.(styles.flashChip, item.flash.sale)}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.meta}>
          {pricing ? (
            <span className={styles.prices}>
              <span className={styles.price}>{formatKes(pricing.salePrice)}</span>
              {onSale && (
                <s className={styles.was}>
                  <span className={styles.sr}>{labels.was} </span>
                  {formatKes(pricing.regularPrice)}
                </s>
              )}
            </span>
          ) : (
            <span />
          )}
          <AvailabilityDot availability={availability} />
        </span>
      </span>
    </button>
  );
}
