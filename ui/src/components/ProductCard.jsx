import { formatKes } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import slots from "../slots.module.css";
import LazyImage from "./LazyImage.jsx";
import OfferChip from "./OfferChip.jsx";
import StockTag from "./StockTag.jsx";
import styles from "./ProductCard.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  lowStock: "Low stock",
  onlyLeft: "Only {n} left"
};

export function DiscountChip({ percent }) {
  return <span className={styles.chip}>-{percent}%</span>;
}

export default function ProductCard({ item, onSelect, className = "", labels = DEFAULT_LABELS, renderFlash, mode = "live", overlay, quickActions }) {
  const preview = isPreview(mode);
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  const act = actionProps(preview).button(() => onSelect?.(item));

  const card = (
    <button type="button" data-card="" className={`${styles.card} ${className}`} aria-haspopup="dialog" data-mode={preview ? "preview" : undefined} {...act}>
      <span className={styles.media}>
        <LazyImage fill src={item.imageUrl} className={styles.img} />
        {onSale && <DiscountChip percent={pricing.discountPercent} />}
        {item.flash?.sale && renderFlash?.(styles.flashChip, item.flash.sale)}
        <OfferChip offer={item.offer} className={styles.offerChip} labels={labels.offerChip} />
        <StockTag item={item} labels={labels} className={styles.stockTag} onPicture lifted={Boolean(item.flash?.sale)} />
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
