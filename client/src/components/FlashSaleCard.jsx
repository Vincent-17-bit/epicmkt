import { memo, useRef } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBolt, faCircleCheck, faQuoteLeft } from "@fortawesome/free-solid-svg-icons";
import { formatDistance } from "@epicmkt/shared";
import { useCardLife } from "../hooks/useCardLife.js";
import { useCountdownLabel, useUrgency } from "../hooks/useCountdown.js";
import { discountBadge, saleHref, urgencyLabel } from "../lib/flash.js";
import { motionAllowed } from "../lib/motion.js";
import { t } from "../i18n/index.js";
import CountdownTiles from "./CountdownTiles.jsx";
import FuseBar from "./FuseBar.jsx";
import Starburst from "./Starburst.jsx";
import styles from "./FlashSaleCard.module.css";

const kes = (n) => Number(n).toLocaleString("en-KE");
const EMBERS = [8, 22, 38, 54, 70, 86];

function Embers() {
  return (
    <span className={styles.embers} aria-hidden="true">
      {EMBERS.map((left, index) => (
        <svg key={left} className={styles.ember} viewBox="0 0 10 10" style={{ left: `${left}%`, animationDelay: `${index * 0.7}s`, animationDuration: `${3.6 + (index % 3)}s` }}>
          <circle cx="5" cy="5" r="4" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

function StoreRow({ business }) {
  const distance = Number.isFinite(business.distanceKm) ? formatDistance(business.distanceKm) : null;
  return (
    <span className={styles.store}>
      <span className={styles.logo}>
        {business.logo ? <img src={business.logo} alt="" loading="lazy" decoding="async" className={styles.logoImg} /> : business.name.slice(0, 1)}
      </span>
      <span className={styles.storeName}>{business.name}</span>
      {business.verified && <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("flash.verified")} aria-label={t("flash.verified")} />}
      {distance && <span className={styles.distance}>{distance}</span>}
      <span className={business.isOpen ? styles.open : styles.closed}>
        <span className={styles.dot} aria-hidden="true" />
        {business.isOpen ? t("flash.open") : t("flash.closed")}
      </span>
    </span>
  );
}

function FlashSaleCard({ entry, size = "standard" }) {
  const ref = useRef(null);
  const { revealed, animate } = useCardLife(ref);
  const { sale, item, pricing, business } = entry;
  const urgency = useUrgency(sale.endsAt);
  const remaining = useCountdownLabel(sale.endsAt);
  const badge = discountBadge(sale.discount);
  const hero = size === "hero";
  const compact = size === "compact";
  const aria = `${t("flash.cardLabel")}: ${item.name}, ${t("flash.currency")} ${kes(pricing.salePrice)}, ${remaining}`;

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
      ref={ref}
      to={saleHref(entry)}
      className={styles.card}
      data-card=""
      data-size={size}
      data-urgency={urgency}
      data-animate={animate ? "true" : "false"}
      data-revealed={revealed ? "true" : "false"}
      aria-label={aria}
      draggable="false"
    >
      <span className={styles.media}>
        {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className={styles.img} draggable="false" />}
        <span className={styles.vignette} aria-hidden="true" />
        <span className={styles.sweep} aria-hidden="true" />
        {compact ? (
          <span className={styles.ribbon}>{badge.text}</span>
        ) : (
          <>
            <Starburst discount={sale.discount} className={styles.burst} />
            <span className={styles.boltChip} aria-hidden="true">
              <FontAwesomeIcon icon={faBolt} />
            </span>
          </>
        )}
        {hero && animate && motionAllowed() && <Embers />}
        {compact && (
          <span className={styles.timer}>
            <CountdownTiles endsAt={sale.endsAt} variant="chip" />
          </span>
        )}
      </span>

      {!compact && <FuseBar startsAt={sale.startsAt} endsAt={sale.endsAt} animate={animate} className={styles.fuse} />}

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
        {!compact && sale.headline && (
          <span className={styles.headline}>
            <FontAwesomeIcon icon={faQuoteLeft} aria-hidden="true" />
            <span>{sale.headline}</span>
          </span>
        )}
        {!compact && <StoreRow business={business} />}
        {price}
        {!compact && (pricing.savings > 0 || sale.quantityNote) && (
          <span className={styles.tags}>
            {pricing.savings > 0 && (
              <span className={styles.save}>
                {t("flash.save")} {t("flash.currency")} {kes(pricing.savings)}
              </span>
            )}
            {sale.quantityNote && <span className={styles.note}>{sale.quantityNote}</span>}
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
