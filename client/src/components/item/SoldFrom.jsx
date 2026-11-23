import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCommentDots, faFlag, faPhone, faShareNodes, faStore } from "@fortawesome/free-solid-svg-icons";
import { formatDistance, telLink } from "@epicmkt/shared";
import { ShopMap } from "@epicmkt/ui";
import { directionsHref } from "./Delivery.jsx";
import { t } from "../../i18n/index.js";
import { external } from "./links.js";
import { CardSave } from "./SaveItem.jsx";
import styles from "../ItemDetail.module.css";

// The "Sold by" card: who sells it, whether they are open, and the visit / chat / call / share / report actions.
export default function SoldFrom({ ctx }) {
  const { seller, sellerCount, distanceKm, chatHref, onVisit, onChat, onCall, onShare, onReport, business } = ctx;
  if (!seller) return null;
  // Where the shop is: the same map as the shop page, as a still picture with words for screen readers and two links out.
  const lat = Number(seller.lat);
  const lng = Number(seller.lng);
  const hasMap = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const area = seller.townName || business?.area || "";
  const county = business?.county && business.county !== area ? business.county : "";
  const place = [area, county].filter(Boolean).join(", ");
  const larger = hasMap ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : null;
  return (
    <section className={styles.sold} aria-label={t("item.soldBy")} id="item-store">
      <div className={styles.seller}>
        <span className={styles.logo}>
          {seller.logo ? <img src={seller.logo} alt="" className={styles.logoImg} decoding="async" /> : seller.name.slice(0, 1)}
        </span>
        <div className={styles.sellerText}>
          <p className={styles.soldBy}>{t("item.soldBy")}</p>
          <p className={sellerCount > 0 ? `${styles.sellerName} ${styles.sellerNameCounted}` : styles.sellerName}>
            <span>{seller.name}</span>
            {seller.verified && (
              <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("item.verified")} aria-label={t("item.verified")} />
            )}
            {Number.isInteger(sellerCount) && sellerCount > 0 && (
              <span className={styles.sellerCount}>{sellerCount === 1 ? "1 product" : `${sellerCount} products`}</span>
            )}
          </p>
          <p className={styles.sellerMeta}>
            {seller.townName}
            {Number.isFinite(distanceKm) && ` · ${formatDistance(distanceKm)}`}
          </p>
          {!seller.isOpen && seller.statusLine && <p className={styles.sellerMeta}>{seller.statusLine}</p>}
        </div>
        <span className={seller.isOpen ? styles.open : styles.closed}>{seller.isOpen ? t("item.open") : t("item.closed")}</span>
      </div>

      <div className={styles.soldWhere} id="item-store-map">
        {hasMap ? (
          <>
            <ShopMap name={seller.name} lat={lat} lng={lng} interactive={false} className={styles.soldMap} />
            <p className="sr-only">{`Map: ${seller.name} is in ${place || "the pinned area"}.`}</p>
          </>
        ) : null}
        <p className={styles.soldPlace}>
          <strong>{place || seller.name}</strong>
          {Number.isFinite(distanceKm) ? ` · ${formatDistance(distanceKm)} from you` : ""}
        </p>
        <p className={styles.soldLinks}>
          {hasMap ? (
            <>
              <a href={directionsHref(seller)} {...external} className={styles.soldLink}>{t("delivery.directions")}</a>
              <span aria-hidden="true"> · </span>
              <a href={larger} {...external} className={styles.soldLink}>View larger map</a>
            </>
          ) : (
            <a href={chatHref} {...external} className={styles.soldLink} onClick={onChat("where")}>Ask the shop for directions</a>
          )}
        </p>
      </div>

      <div className={styles.actions}>
        <Link to={`/b/${seller.slug}`} className={styles.outline} onClick={onVisit("card")}>
          <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
          <span>{t("item.visitStore")}</span>
        </Link>
        <a href={chatHref} {...external} className={styles.outline} onClick={onChat("card")}>
          <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
          <span>{t("item.chatSeller")}</span>
        </a>
        {/* Calling is a main way to reach the shop (it is a big button on the store page too), so it sits with Visit and Chat. */}
        {seller.phone && (
          <a href={telLink(seller.phone)} className={styles.outline} onClick={onCall}>
            <FontAwesomeIcon icon={faPhone} className={styles.icon} aria-hidden="true" />
            <span>{t("item.call")}</span>
          </a>
        )}
      </div>

      <div className={styles.secondary}>
        <CardSave ctx={ctx} className={styles.ghost} />
        <button type="button" className={styles.ghost} onClick={onShare}>
          <FontAwesomeIcon icon={faShareNodes} aria-hidden="true" />
          <span>{t("item.share")}</span>
        </button>
        <button type="button" className={styles.ghost} onClick={onReport}>
          <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
          <span>{t("item.reportPrice")}</span>
        </button>
      </div>

      <p className={styles.note}>{t("item.disclaimer")}</p>
    </section>
  );
}
