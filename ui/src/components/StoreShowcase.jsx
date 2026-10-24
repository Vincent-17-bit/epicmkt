import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { formatKes } from "@epicmkt/shared";
import { isPreview } from "../preview.js";
import BrandMark from "./BrandMark.jsx";
import Picture from "./Picture.jsx";
import { OpenStatus, VerifiedMark } from "./Marks.jsx";
import Skeleton from "./Skeleton.jsx";
import StoreActions from "./StoreActions.jsx";
import StoreThumb from "./StoreThumb.jsx";
import { planShowcase } from "./showcasePlan.js";
import styles from "./StoreShowcase.module.css";

const DEFAULT_LABELS = {
  visitStore: "Visit store",
  comingSoon: "Products coming soon",
  open: "Open",
  closed: "Closed",
  featured: "Featured store",
  verified: "Verified store",
  soldOut: "Sold out"
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

const SOLD_OUT = new Set(["out_of_stock", "unavailable"]);

function Avatar({ business }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [business.logoUrl]);
  return (
    <span className={styles.avatar}>
      {business.logoUrl && !failed ? (
        <img src={business.logoUrl} alt="" loading="lazy" decoding="async" className={styles.avatarImg} onError={() => setFailed(true)} />
      ) : (
        <BrandMark className={styles.avatarMark} />
      )}
    </span>
  );
}

/**
 * A featured store as one card: the store's name as a header that opens the store, a small grid of its products
 * (each opens its own product page), and Call, WhatsApp and Directions along the bottom. Fewer than four products
 * is handled by `planShowcase`, so a new store with nothing listed still fills the card.
 *
 * `products` are already chosen and ordered by the caller. `itemHref(item)` gives each product's page.
 */
export default function StoreShowcase({
  business,
  products = [],
  href,
  itemHref,
  renderLink = plainLink,
  onContact,
  labels = DEFAULT_LABELS,
  mode = "live",
  loading = false,
  className = ""
}) {
  const preview = isPreview(mode);
  const Link = preview ? inertLink : renderLink;
  const to = preview ? undefined : href;
  const text = { ...DEFAULT_LABELS, ...labels };
  const where = [business.categoryName, business.area].filter(Boolean).join(" · ");
  const cells = loading ? [] : planShowcase(products);

  return (
    <article className={`${styles.card} ${className}`} data-mode={preview ? "preview" : undefined}>
      <div className={styles.inner}>
        <h3 className={styles.title}>
          <Link href={to} className={styles.head} title={business.name}>
            <Avatar business={business} />
            <span className={styles.name}>{business.name}</span>
            {business.verified && <VerifiedMark label={text.verified} />}
            <FontAwesomeIcon icon={faChevronRight} className={styles.chevron} aria-hidden="true" />
          </Link>
        </h3>

        <p className={styles.meta}>
          <span className={styles.where}>{where}</span>
          <OpenStatus isOpen={Boolean(business.isOpen)} labels={text} />
        </p>

        <ul className={styles.grid} data-slots={cells.length} aria-busy={loading || undefined}>
          {loading &&
            [0, 1, 2, 3].map((slot) => (
              <li key={slot} className={styles.cell} aria-hidden="true">
                <Skeleton width="100%" height="100%" radius="var(--radius-sm)" />
              </li>
            ))}
          {cells.map((cell, index) => {
            if (cell.kind === "store") {
              return (
                <li key={`store-${index}`} className={styles.cell} data-span={cell.span}>
                  <Link href={to} className={`${styles.tile} ${styles.storeCell}`} tabIndex={preview ? undefined : 0}>
                    <span className={styles.storePicture}>
                      <StoreThumb coverUrl={business.coverUrl} logoUrl={business.logoUrl} />
                    </span>
                    <span className={styles.storeLabel}>
                      <span className={styles.visit}>
                        {text.visitStore}
                        <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                      </span>
                      {cell.span === "hero" && (
                        <span className={styles.blurb}>{business.tagline || text.comingSoon}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            }
            const { item } = cell;
            const soldOut = SOLD_OUT.has(item.availability);
            const price = item.pricing?.salePrice;
            const discount = item.pricing?.discountPercent;
            return (
              <li key={item.id} className={styles.cell} data-span={cell.span}>
                <Link href={preview ? undefined : itemHref?.(item)} className={`${styles.tile} ${soldOut ? styles.soldOut : ""}`} title={item.name}>
                  <span className={styles.media}>
                    <Picture src={item.imageUrl} imgClassName={styles.picture} />
                    {discount > 0 && <span className={styles.sale}>-{discount}%</span>}
                    {soldOut && <span className={styles.stock}>{text.soldOut}</span>}
                  </span>
                  <span className={styles.label}>
                    <span className={styles.itemName}>{item.name}</span>
                    {Number.isFinite(price) && <span className={styles.price}>{formatKes(price)}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <StoreActions business={business} onContact={onContact} mode={mode} className={styles.actions} />
      </div>
    </article>
  );
}
