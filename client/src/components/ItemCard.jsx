import { Link } from "react-router-dom";
import { formatKes } from "@epicmkt/shared";
import { itemPath } from "../config/breadcrumbs.js";
import { t } from "../i18n/index.js";
import FlashChip from "./FlashChip.jsx";
import styles from "./ItemCard.module.css";

export default function ItemCard({ item, onSelect, className = "" }) {
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  const availability = item.availability ?? "available";

  return (
    <Link
      to={itemPath(item.businessSlug, item.id)}
      data-card=""
      className={`${styles.card} ${className}`}
      onClick={() => onSelect?.(item)}
      draggable="false"
    >
      <span className={styles.media}>
        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className={styles.img} draggable="false" />}
        {onSale && <span className={styles.chip}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && <FlashChip endsAt={item.flash.sale.endsAt} className={styles.flashChip} />}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.meta}>
          {pricing ? (
            <span className={styles.prices}>
              <span className={styles.price}>{formatKes(pricing.salePrice)}</span>
              {onSale && (
                <s className={styles.was}>
                  <span className={styles.sr}>{t("item.was")} </span>
                  {formatKes(pricing.regularPrice)}
                </s>
              )}
            </span>
          ) : (
            <span />
          )}
          <span className={styles.avail}>
            <span className={`${styles.dot} ${styles[availability]}`} aria-hidden="true" />
            <span className={styles.sr}>{t(`item.availability.${availability}`)}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
