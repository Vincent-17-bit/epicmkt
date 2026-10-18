import { formatKes } from "@epicmkt/shared";
import { memo } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBolt, faCircleCheck, faQuoteLeft } from "@fortawesome/free-solid-svg-icons";
import { formatDistance } from "@epicmkt/shared";
import { useCountdownLabel, useUrgency } from "../hooks/useCountdown.js";
import { saleHref, urgencyLabel } from "../lib/flash.js";
import { t } from "../i18n/index.js";
import CountdownTiles from "./CountdownTiles.jsx";
import FuseBar from "./FuseBar.jsx";
import Starburst from "./Starburst.jsx";
import styles from "./FlashSaleCard.module.css";

const kes = (n) => Number(n).toLocaleString("en-KE");

function StoreRow({ business }) {
  const distance = Number.isFinite(business.distanceKm) ? formatDistance(business.distanceKm) : null;
  return (
    <span className={styles.store}>
      <span className={styles.storeMain}>
        <span className={styles.logo}>
          {business.logo ? <img src={business.logo} alt="" loading="lazy" decoding="async" className={styles.logoImg} /> : business.name.slice(0, 1)}
        </span>
        <span className={styles.storeName}>{business.name}</span>
        {business.verified && <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("flash.verified")} aria-label={t("flash.verified")} />}
      </span>
      <span className={styles.meta}>
        {distance && <span className={styles.distance}>{distance}</span>}
        <span className={business.isOpen ? styles.open : styles.closed}>
          <span className={styles.dot} aria-hidden="true" />
          {business.isOpen ? t("flash.open") : t("flash.closed")}
        </span>
      </span>
    </span>
  );
}

// `size` is still accepted for compatibility: "hero" now renders exactly like "standard".
function FlashSaleCard({ entry, size = "standard" }) {
  const { sale, item, pricing, business } = entry;
  const urgency = useUrgency(sale.endsAt);
  const remaining = useCountdownLabel(sale.endsAt);
  const compact = size === "compact";
  const aria = `${t("flash.cardLabel")}: ${item.name}, ${formatKes(pricing.salePrice)}, ${remaining}`;

  const price = (
    <span className={styles.prices}>
      <span className={styles.sale}>
        <span className={styles.cur}>{t("flash.currency")}</span>
        {kes(pricing.salePrice)}
      </span>
      {pricing.savings > 0 && (
        <s className={styles.was}>
          <span className={styles.sr}>{t("item.was")} </span>
          {kes(pricing.regularPrice)}
        </s>
      )}
    </span>
  );

  return (
    <Link
      to={saleHref(entry)}
      className={styles.card}
      data-card=""
      data-size={size}
      data-urgency={urgency}
      aria-label={aria}
      draggable="false"
    >
      <span className={styles.media}>
        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className={styles.img} draggable="false" />}
        <Starburst discount={sale.discount} className={styles.burst} />
        {!compact && (
          <span className={styles.boltChip} aria-hidden="true">
            <FontAwesomeIcon icon={faBolt} />
          </span>
        )}
        {compact && (
          <span className={styles.timer}>
            <CountdownTiles endsAt={sale.endsAt} variant="chip" />
          </span>
        )}
      </span>

      {!compact && <FuseBar startsAt={sale.startsAt} endsAt={sale.endsAt} className={styles.fuse} />}

      {!compact && (
        <span className={styles.band}>
          <span className={styles.bandLabel}>
            <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
            {urgencyLabel(urgency)}
          </span>
          <CountdownTiles endsAt={sale.endsAt} variant="card" />
        </span>
      )}

      <span className={styles.body}>
        <span className={styles.name}>{item.name}</span>
        {!compact && (
          <span className={styles.headlineSlot}>
            {sale.headline && (
              <span className={styles.headline}>
                <FontAwesomeIcon icon={faQuoteLeft} aria-hidden="true" />
                <span>{sale.headline}</span>
              </span>
            )}
          </span>
        )}
        {!compact && <StoreRow business={business} />}
        {price}
        {!compact && (
          <span className={styles.tags}>
            {pricing.savings > 0 && (
              <span className={styles.save}>
                {t("flash.save")} {formatKes(pricing.savings)}
              </span>
            )}
            {sale.quantityNote && (
              <span className={styles.note} title={sale.quantityNote}>
                {sale.quantityNote}
              </span>
            )}
          </span>
        )}
      </span>

      {!compact && (
        <span className={styles.cta}>
          {t("flash.viewDeal")}
          <FontAwesomeIcon icon={faArrowRight} className={styles.arrow} aria-hidden="true" />
        </span>
      )}
    </Link>
  );
}

export default memo(FlashSaleCard);
