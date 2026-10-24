import { formatKes } from "@epicmkt/shared";
import { isPreview } from "../preview.js";
import { FeaturedMark, OpenStatus, VerifiedMark } from "./Marks.jsx";
import PromoChip from "./PromoChip.jsx";
import StoreActions from "./StoreActions.jsx";
import StoreThumb from "./StoreThumb.jsx";
import styles from "./StoreTile.module.css";

const DEFAULT_LABELS = {
  from: "From",
  open: "Open",
  closed: "Closed",
  featured: "Featured store",
  verified: "Verified store"
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
 * A compact store card for carousels and grids. The picture takes two thirds of the card and the details follow in
 * the last third (name, category and town, open or closed and the starting price), with the contact buttons on a
 * strip underneath. Nothing sits across the picture and the details, and the card keeps one shape whatever the store
 * has: no cover, no logo, no price, a very long name. The whole top of the card is a single link to the store.
 */
export default function StoreTile({
  business,
  href,
  renderLink = plainLink,
  onContact,
  labels = DEFAULT_LABELS,
  promoLabels,
  mode = "live",
  className = ""
}) {
  const preview = isPreview(mode);
  const Link = preview ? inertLink : renderLink;
  const to = preview ? undefined : href;
  const text = { ...DEFAULT_LABELS, ...labels };
  const where = [business.categoryName, business.area].filter(Boolean).join(" · ");
  const hasPrice = business.fromPriceKes != null && Number.isFinite(Number(business.fromPriceKes));

  return (
    <article className={`${styles.tile} ${className}`} data-mode={preview ? "preview" : undefined}>
      <div className={styles.inner}>
      <div className={styles.top}>
        <div className={styles.media}>
          <StoreThumb coverUrl={business.coverUrl} logoUrl={business.logoUrl} />
          <PromoChip promo={business.promo} className={styles.promo} labels={promoLabels} />
        </div>

        <div className={styles.info}>
          <h3 className={styles.name}>
            <Link href={to} className={styles.nameLink} title={business.name}>
              {business.name}
            </Link>
            {business.plan === "premium" && <FeaturedMark label={text.featured} className={styles.featuredMark} />}
            {business.verified && <VerifiedMark label={text.verified} />}
          </h3>
          {where && <p className={styles.where}>{where}</p>}
          <p className={styles.facts}>
            <OpenStatus isOpen={Boolean(business.isOpen)} labels={text} title={business.statusLine} />
            {hasPrice && (
              <span className={styles.price}>
                <span className={styles.from}>{text.from} </span>
                {formatKes(business.fromPriceKes)}
              </span>
            )}
          </p>
        </div>
      </div>

      <StoreActions business={business} onContact={onContact} mode={mode} className={styles.actions} />
      </div>
    </article>
  );
}
