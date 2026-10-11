import { formatKes } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import slots from "../slots.module.css";
import styles from "./ProductCard.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  availability: { available: "Available", limited: "Limited", unavailable: "Unavailable" }
};

export function AvailabilityDot({ availability = "available", label }) {
  return (
    <span className={styles.avail}>
      <span className={`${styles.dot} ${styles[availability]}`} aria-hidden="true" />
      <span className={styles.sr}>{label}</span>
    </span>
  );
}

export function DiscountChip({ percent }) {
  return <span className={styles.chip}>-{percent}%</span>;
}

export default function ProductCard({ item, onSelect, className = "", labels = DEFAULT_LABELS, renderFlash, mode = "live", overlay, quickActions }) {
  const preview = isPreview(mode);
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  const availability = item.availability ?? "available";
  const act = actionProps(preview).button(() => onSelect?.(item));

  const card = (
    <button type="button" data-card="" className={`${styles.card} ${className}`} aria-haspopup="dialog" data-mode={preview ? "preview" : undefined} {...act}>
      <span className={styles.media}>
        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className={styles.img} draggable="false" />}
        {onSale && <DiscountChip percent={pricing.discountPercent} />}
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
          <AvailabilityDot availability={availability} label={labels.availability[availability]} />
        </span>
      </span>
    </button>
  );

  if (!overlay && !quickActions) return card;

  return (
    <div className={slots.frame} data-mode={preview ? "preview" : undefined}>
      {card}
      {overlay && (
        <div className={slots.overlay} data-slot="overlay">
          {overlay}
        </div>
      )}
      {quickActions && (
        <div className={slots.quickActions} data-slot="quick-actions">
          {quickActions}
        </div>
      )}
    </div>
  );
}
