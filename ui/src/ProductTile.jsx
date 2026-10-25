import { formatKes } from "@epicmkt/shared";
import { isPreview } from "./preview.js";
import OfferChip from "./components/OfferChip.jsx";
import { FeaturedMark, VerifiedMark } from "./components/Marks.jsx";
import LazyImage from "./components/LazyImage.jsx";
import styles from "./ProductTile.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  verified: "Verified store",
  featured: "Featured store",
  offerChip: { offer: "Offer", more: "more" },
  closed: "Closed",
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
 * the last third: name, price and the store it is sold by, with a blue tick for a verified store and an amber star for
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
  // A short line after the name. It shares the name's two lines, so it fills the space a short name leaves and is cut
  // with an ellipsis when long: it can never push the price or the store out of the card.
  const blurb = (item.shortDescription || item.description || item.section || "").replace(/\s+/g, " ").trim();

  return (
    <Link
      href={preview ? undefined : href}
      className={`${styles.tile} ${soldOut ? styles.soldOut : ""} ${className}`}
      data-mode={preview ? "preview" : undefined}
    >
      <span className={styles.media}>
        <LazyImage fill src={item.imageUrl} className={styles.img} />
        {onSale && <span className={styles.sale}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && renderFlash?.(styles.flash)}
        <OfferChip offer={item.offer} className={styles.offer} labels={labels.offerChip} />
        {soldOut && <span className={styles.stock}>{labels.availability(availability)}</span>}
      </span>

      <span className={styles.body}>
        <span className={styles.copy}>
          <span className={styles.name}>{item.name}</span>
          {blurb && <span className={styles.blurb}> {blurb}</span>}
        </span>
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
          {store.featured && <FeaturedMark label={labels.featured} />}
          <span className={styles.storeName}>{store.name}</span>
          {store.isOpen === false && (
            <span className={styles.closed} title={store.statusLine ?? undefined}>
              {labels.closed ?? DEFAULT_LABELS.closed}
            </span>
          )}
          {store.verified && <VerifiedMark label={labels.verified} />}
        </span>
      </span>
    </Link>
  );
}
