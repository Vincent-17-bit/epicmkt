import { formatKes, isListed } from "@epicmkt/shared";
import { isPreview } from "./preview.js";
import OfferChip from "./components/OfferChip.jsx";
import { FeaturedMark, VerifiedMark } from "./components/Marks.jsx";
import { cardBlurb, coverUrl } from "./lib/media.js";
import LazyImage from "./components/LazyImage.jsx";
import StockTag from "./components/StockTag.jsx";
import styles from "./ProductTile.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  verified: "Verified store",
  featured: "Featured store",
  offerChip: { offer: "Offer", more: "more" },
  closed: "Closed",
  lowStock: "Low stock",
  onlyLeft: "Only {n} left"
};

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
 * Availability: an available item shows nothing extra, an item running low shows a small "Low stock" (or "Only 3 left")
 * tag beside the price, and a sold-out item is not drawn at all. Sold-out items are not listed to customers, so a list
 * that still contains one is a bug elsewhere; the tile refuses to show it rather than put it in front of a customer.
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
  // A short line after the name. It shares the name's two lines, so it fills the space a short name leaves and is cut
  // with an ellipsis when long: it can never push the price or the store out of the card.
  const blurb = cardBlurb(item) || String(item.section ?? "").trim();

  if (!isListed(item)) return null;

  return (
    <Link
      href={preview ? undefined : href}
      className={`${styles.tile} ${className}`}
      data-mode={preview ? "preview" : undefined}
    >
      <span className={styles.media}>
        <LazyImage fill src={coverUrl(item)} className={styles.img} />
        {onSale && <span className={styles.sale}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && renderFlash?.(styles.flash)}
        <OfferChip offer={item.offer} className={styles.offer} labels={labels.offerChip} />
        <StockTag item={item} labels={labels} className={styles.stockTag} onPicture lifted={Boolean(item.flash?.sale)} />
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
