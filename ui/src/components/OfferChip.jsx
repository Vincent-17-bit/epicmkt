import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag } from "@fortawesome/free-solid-svg-icons";
import styles from "./OfferChip.module.css";

const DEFAULT_LABELS = { offer: "Offer", more: "more" };

/**
 * The small tag a product shows when it is in an offer: "Buy 2 Get 1 Free", "15% off", "Happy hour".
 * It sits over the product's picture (position it with `className`) and never takes room from the name, price or store.
 * `offer` is { label, extra }: the offer to name and how many more the product is in.
 */
export default function OfferChip({ offer, className = "", labels = DEFAULT_LABELS }) {
  if (!offer?.label) return null;
  const extra = offer.extra > 0 ? offer.extra : 0;
  return (
    <span className={`${styles.offerTag} ${className}`} data-offer-chip="">
      <span className={styles.sr}>
        {labels.offer}: {offer.label}
        {extra > 0 && `, +${extra} ${labels.more}`}
      </span>
      <span className={styles.visual} aria-hidden="true">
        <FontAwesomeIcon icon={faTag} className={styles.icon} />
        <span className={styles.text}>{offer.label}</span>
        {extra > 0 && <span className={styles.more}>+{extra}</span>}
      </span>
    </span>
  );
}
