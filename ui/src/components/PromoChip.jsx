import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faTag } from "@fortawesome/free-solid-svg-icons";
import styles from "./PromoChip.module.css";

const DEFAULT_LABELS = { flash: "Flash sale", offer: "Offer", products: "products on offer" };

/**
 * What a store card says about its promotions. Flash sales and offers each get their own chip, side by side, because
 * they mean different things: a flash sale is a timed price cut, an offer is a deal on particular products.
 * `promo.offers` counts PRODUCTS that have an offer (not offers), so "Offer 3" means three products carry one.
 */
export default function PromoChip({ promo, className = "", labels = DEFAULT_LABELS }) {
  const flash = promo?.flash ?? 0;
  const offers = promo?.offers ?? 0;
  if (flash + offers === 0) return null;
  const suffix = labels.products ?? DEFAULT_LABELS.products;
  return (
    <span className={`${styles.group} ${className}`}>
      {flash > 0 && (
        <span className={`${styles.chip} ${styles.flash}`}>
          <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
          <span>{labels.flash}</span>
          {flash > 1 && <span className={styles.count}>{flash}</span>}
        </span>
      )}
      {offers > 0 && (
        <span className={`${styles.chip} ${styles.offer}`}>
          <FontAwesomeIcon icon={faTag} aria-hidden="true" />
          <span>{labels.offer}</span>
          {offers > 1 && (
            <>
              <span className={styles.count} aria-hidden="true">{offers}</span>
              <span className={styles.sr}>{offers} {suffix}</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
