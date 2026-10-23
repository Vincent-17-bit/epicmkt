import { formatKes } from "@epicmkt/shared";
import LazyImage from "./components/LazyImage.jsx";
import styles from "./ItemCard.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  availability: (key) => ({ available: "Available", limited: "Limited", unavailable: "Unavailable" })[key] ?? key,
};

export default function ItemCard({
  item,
  onSelect,
  className = "",
  labels = DEFAULT_LABELS,
  renderFlash,
  overlay = null,
  quickActions = null,
  dimmed = false,
  selected = false,
}) {
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  const availability = item.availability ?? "available";

  const face = (
    <button
      type="button"
      data-card=""
      className={`${styles.card} ${className}`}
      onClick={() => onSelect?.(item)}
      aria-haspopup="dialog"
    >
      <span className={styles.media}>
        <LazyImage fill src={item.imageUrl} className={styles.img} />
        {onSale && <span className={styles.chip}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && renderFlash?.(styles.flashChip)}
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
          <span className={styles.avail}>
            <span className={`${styles.dot} ${styles[availability]}`} aria-hidden="true" />
            <span className={styles.sr}>{labels.availability(availability)}</span>
          </span>
        </span>
      </span>
    </button>
  );

  if (!overlay && !quickActions) return face;

  return (
    <div className={`${styles.shell} ${dimmed ? styles.dimmed : ""} ${selected ? styles.selected : ""}`} data-card-shell="">
      {face}
      {overlay && <div className={styles.overlay}>{overlay}</div>}
      {quickActions && <div className={styles.actions}>{quickActions}</div>}
    </div>
  );
}
