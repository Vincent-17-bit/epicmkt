import { formatKes } from "@epicmkt/shared";
import { cardBlurb, coverUrl } from "./lib/media.js";
import LazyImage from "./components/LazyImage.jsx";
import OfferChip from "./components/OfferChip.jsx";
import StockTag from "./components/StockTag.jsx";
import SaveButton from "./components/SaveButton.jsx";
import styles from "./ItemCard.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  lowStock: "Low stock",
  onlyLeft: "Only {n} left",
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
  action = null,
}) {
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  const blurb = cardBlurb(item);

  const face = (
    <button
      type="button"
      data-card=""
      className={`${styles.card} ${className}`}
      onClick={() => onSelect?.(item)}
      aria-haspopup="dialog"
    >
      <span className={styles.media}>
        <LazyImage fill src={coverUrl(item)} className={styles.img} />
        {onSale && <span className={styles.chip}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && renderFlash?.(styles.flashChip)}
        <OfferChip offer={item.offer} className={styles.offerChip} labels={labels.offerChip} />
        <StockTag item={item} labels={labels} className={styles.stockTag} onPicture lifted={Boolean(item.flash?.sale)} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{item.name}</span>
        {blurb && <span className={styles.blurb}>{blurb}</span>}
        <span className={styles.meta}>
          {pricing ? (
            <span className={styles.prices}>
              <span className={styles.price}>{formatKes(pricing.salePrice)}</span>
              {onSale && (
                <s className={styles.was}>
                  <span className="sr-only">{labels.was} </span>
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

  if (!overlay && !quickActions && !action) return face;

  return (
    <div className={`${styles.shell} ${dimmed ? styles.dimmed : ""} ${selected ? styles.selected : ""}`} data-card-shell="" data-save={action ? "" : undefined}>
      {face}
      {/* The heart is the card button's sibling, never inside it, so a tap on it cannot open the item. It sits on the price row, at its right end. */}
      {action && (
        <span className={styles.save}>
          <SaveButton saved={action.saved} onToggle={action.onToggle} label={action.label} size={20} />
        </span>
      )}
      {overlay && <div className={styles.overlay}>{overlay}</div>}
      {quickActions && <div className={styles.actions}>{quickActions}</div>}
    </div>
  );
}
