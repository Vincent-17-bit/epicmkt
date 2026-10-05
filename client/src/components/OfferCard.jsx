import { memo } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { formatDistance } from "@epicmkt/shared";
import { offerExpiry, offerValueLabel } from "../lib/itemView.js";
import { offerHref } from "../lib/offers.js";
import { t } from "../i18n/index.js";
import styles from "./OfferCard.module.css";

function OfferCard({ view }) {
  const { offer, business, remainingMs, appliesToLabel } = view;
  const expiry = offerExpiry(remainingMs);
  const distance = Number.isFinite(business.distanceKm) ? formatDistance(business.distanceKm) : null;

  return (
    <Link to={offerHref(view)} className={styles.card} draggable="false" aria-label={`${offer.title}, ${business.name}`}>
      <span className={styles.value}>{offerValueLabel(offer)}</span>
      <span className={styles.body}>
        <span className={styles.store}>
          <span className={styles.logo}>
            {business.logo ? <img src={business.logo} alt="" loading="lazy" decoding="async" className={styles.logoImg} /> : business.name.slice(0, 1)}
          </span>
          <span className={styles.storeName}>{business.name}</span>
          {business.verified && <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("flash.verified")} aria-label={t("flash.verified")} />}
          {distance && <span className={styles.meta}>{distance}</span>}
        </span>
        <span className={styles.title}>{offer.title}</span>
        {offer.description && <span className={styles.description}>{offer.description}</span>}
        <span className={styles.meta}>
          <span>{appliesToLabel}</span>
          <span>{expiry ? `${t("item.endsIn")} ${expiry}` : t("item.noLimit")}</span>
          {offer.code && (
            <span>
              {t("item.code")} <strong>{offer.code}</strong>
            </span>
          )}
        </span>
        <span className={styles.cta}>
          {t("offers.view")}
          <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

export default memo(OfferCard);
