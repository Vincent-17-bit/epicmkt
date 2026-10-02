import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow, faStar } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { directionsLink, formatDistance, formatKes, telLink, whatsappLink } from "@epicmkt/shared";
import { logContactEvent } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import Button from "./Button.jsx";
import { FeaturedBadge, VerifiedBadge } from "./Badges.jsx";
import styles from "./BusinessCard.module.css";

export default function BusinessCard({ business }) {
  const track = (type) => () => logContactEvent({ businessId: business.id, type });
  const hasBadges = business.plan === "premium" || business.verified;

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <span className={styles.icon}>
          <FontAwesomeIcon icon={categoryIcon(business.categoryIcon)} />
        </span>
        <div className={styles.titles}>
          <h3 className={styles.name}>{business.name}</h3>
          <p className={styles.where}>
            {business.categoryName} · {business.area}, {business.county}
          </p>
        </div>
      </div>

      {hasBadges && (
        <div className={styles.badges}>
          {business.plan === "premium" && <FeaturedBadge />}
          {business.verified && <VerifiedBadge />}
        </div>
      )}

      <p className={styles.tagline}>{business.tagline}</p>

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
        <Button as="a" size="sm" href={telLink(business.phone)} icon={faPhone} onClick={track("call")}>
          Call
        </Button>
        <Button
          as="a"
          size="sm"
          variant="secondary"
          href={whatsappLink(business.whatsapp, `Hi ${business.name}, I found you on EpicMKT.`)}
          target="_blank"
          rel="noopener noreferrer"
          icon={faWhatsapp}
          onClick={track("whatsapp")}
        >
          WhatsApp
        </Button>
        <Button
          as="a"
          size="sm"
          variant="secondary"
          href={directionsLink(business.lat, business.lng)}
          target="_blank"
          rel="noopener noreferrer"
          icon={faLocationArrow}
          onClick={track("directions")}
        >
          Directions
        </Button>
      </div>
    </article>
  );
}
