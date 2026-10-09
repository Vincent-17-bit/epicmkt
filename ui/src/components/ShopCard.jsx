import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow, faStar, faStore } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, formatDistance, formatKes, telLink, whatsappLink } from "@epicmkt/shared";
import { actionProps, isPreview } from "../preview.js";
import slots from "../slots.module.css";
import Button from "./Button.jsx";
import { FeaturedBadge, VerifiedBadge } from "./Badges.jsx";
import PromoChip from "./PromoChip.jsx";
import styles from "./ShopCard.module.css";

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

export default function ShopCard({ business, href, renderLink = plainLink, icon = faStore, onContact, promoLabels, mode = "live", overlay, quickActions }) {
  const preview = isPreview(mode);
  const act = actionProps(preview);
  const track = (type) => () => onContact?.(business, type);
  const hasBadges = business.plan === "premium" || business.verified;
  const Link = preview ? inertLink : renderLink;
  const to = preview ? undefined : href;
  const external = { target: "_blank", rel: "noopener noreferrer" };

  const card = (
    <article className={styles.card} style={{ "--hue": business.hue ?? 210 }} data-mode={preview ? "preview" : undefined}>
      <div className={styles.top}>
        <Link href={to} className={styles.cover} tabIndex={-1} aria-hidden="true">
          {business.coverUrl ? (
            <img src={business.coverUrl} alt="" loading="lazy" decoding="async" className={styles.coverImg} />
          ) : (
            <FontAwesomeIcon icon={icon} />
          )}
        </Link>
        <PromoChip promo={business.promo} className={styles.promo} labels={promoLabels} />
        {hasBadges && (
          <div className={styles.badges}>
            {business.plan === "premium" && <FeaturedBadge />}
            {business.verified && <VerifiedBadge />}
          </div>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.head}>
          <span className={styles.icon}>
            {business.logoUrl ? (
              <img src={business.logoUrl} alt="" loading="lazy" decoding="async" className={styles.logoImg} />
            ) : (
              <FontAwesomeIcon icon={icon} />
            )}
          </span>
          <div className={styles.titles}>
            <h3 className={styles.name}>
              <Link href={to} className={styles.nameLink}>
                {business.name}
              </Link>
            </h3>
            <p className={styles.where}>
              {business.categoryName} · {business.area}, {business.county}
            </p>
          </div>
        </div>

        <p className={styles.tagline}>{business.tagline}</p>

        {business.highlights?.length > 0 && (
          <ul className={styles.highlights} aria-label="Highlights">
            {business.highlights.map((item) => (
              <li key={item} className={styles.highlight}>
                {item}
              </li>
            ))}
          </ul>
        )}

        {(business.fromPriceKes != null || business.distanceKm != null) && (
          <p className={styles.facts}>
            {[
              business.fromPriceKes != null && `From ${formatKes(business.fromPriceKes)}`,
              business.distanceKm != null && `${formatDistance(business.distanceKm)} away`
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        <div className={styles.meta}>
          <span className={styles.rating}>
            <FontAwesomeIcon icon={faStar} />
            {business.reviewCount > 0 ? (
              <>
                {business.rating.toFixed(1)} <span className={styles.count}>({business.reviewCount})</span>
              </>
            ) : (
              "New"
            )}
          </span>
          <span className={business.isOpen ? styles.open : styles.closed}>{business.isOpen ? "Open now" : "Closed"}</span>
        </div>

        <div className={styles.actions}>
          <Button as="a" size="sm" icon={faPhone} {...act.link(telLink(business.phone), track("call"))}>
            Call
          </Button>
          <Button
            as="a"
            size="sm"
            variant="secondary"
            icon={faWhatsapp}
            {...act.link(whatsappLink(business.whatsapp, `Hi ${business.name}, I found you on EpicMKT.`), track("whatsapp"), external)}
          >
            WhatsApp
          </Button>
          <Button
            as="a"
            size="sm"
            variant="secondary"
            icon={faLocationArrow}
            {...act.link(directionsLink(business.lat, business.lng), track("directions"), external)}
          >
            Directions
          </Button>
        </div>
      </div>
    </article>
  );

  if (!overlay && !quickActions) return card;

  return (
    <div className={slots.frame}>
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
