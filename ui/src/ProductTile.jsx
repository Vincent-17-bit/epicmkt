import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faImage, faStore } from "@fortawesome/free-solid-svg-icons";
import { formatKes } from "@epicmkt/shared";
import { isPreview } from "./preview.js";
import styles from "./ProductTile.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  verified: "Verified store",
  featured: "Featured store",
  availability: (key) =>
    ({
      available: "Available",
      limited_stock: "Limited stock",
      out_of_stock: "Out of stock",
      unavailable: "Unavailable",
      by_appointment: "By appointment"
    })[key] ?? key
};

const TONE = { available: "ok", limited_stock: "warn", out_of_stock: "bad", unavailable: "bad", by_appointment: "info" };
const SOLD_OUT = new Set(["out_of_stock", "unavailable"]);

const plainLink = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

const inertLink = ({ href, children, ...rest }) => (
  <a aria-disabled="true" {...rest}>
    {children}
  </a>
);

/**
 * A product card for lists of products from many stores. The picture takes two thirds of the card and the details
 * the last third: name, price and the store it is sold by, with a blue tick for a verified store and a gold mark for
 * a featured one. The whole card is one link, so the store name is text, not a nested link.
 *
 * `item.business` is `{ name, verified, featured }`. Everything that varies in wording comes in as `labels`.
 */
export default function ProductTile({
  item,
  href,
  renderLink = plainLink,
  labels = DEFAULT_LABELS,
  renderFlash,
  mode = "live",
  className = ""
}) {
  const preview = isPreview(mode);
  const Link = preview ? inertLink : renderLink;
  const store = item.business ?? {};
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  const availability = item.availability ?? "available";
  const soldOut = SOLD_OUT.has(availability);

  return (
    <Link
      href={preview ? undefined : href}
      className={`${styles.tile} ${soldOut ? styles.soldOut : ""} ${className}`}
      data-mode={preview ? "preview" : undefined}
    >
      <span className={styles.media}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className={styles.img} draggable="false" />
        ) : (
          <span className={styles.noImage} aria-hidden="true">
            <FontAwesomeIcon icon={faImage} />
          </span>
        )}
        {onSale && <span className={styles.sale}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && renderFlash?.(styles.flash)}
        {soldOut && <span className={styles.stock}>{labels.availability(availability)}</span>}
      </span>

      <span className={styles.body}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.priceRow}>
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
          {!soldOut && (
            <span className={`${styles.dot} ${styles[TONE[availability] ?? "ok"]}`}>
              <span className={styles.sr}>{labels.availability(availability)}</span>
            </span>
          )}
        </span>
        <span className={styles.store}>
          {store.featured && (
            <span className={styles.gold} title={labels.featured}>
              <FontAwesomeIcon icon={faStore} aria-hidden="true" />
              <span className={styles.sr}>{labels.featured}. </span>
            </span>
          )}
          <span className={styles.storeName}>{store.name}</span>
          {store.verified && (
            <span className={styles.tick} title={labels.verified}>
              <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" />
              <span className={styles.sr}>{labels.verified}</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
