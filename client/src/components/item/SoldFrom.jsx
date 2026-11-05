import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCommentDots, faFlag, faPhone, faShareNodes, faStore } from "@fortawesome/free-solid-svg-icons";
import { formatDistance, telLink } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import { external } from "./links.js";
import styles from "../ItemDetail.module.css";

// The "Sold by" card: who sells it, whether they are open, and the visit / chat / call / share / report actions.
export default function SoldFrom({ ctx }) {
  const { seller, sellerCount, distanceKm, chatHref, onVisit, onChat, onCall, onShare, onReport } = ctx;
  if (!seller) return null;
  return (
    <section className={styles.sold} aria-label={t("item.soldBy")}>
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

      <div className={styles.actions}>
        <Link to={`/b/${seller.slug}`} className={styles.outline} onClick={onVisit("card")}>
          <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
          <span>{t("item.visitStore")}</span>
        </Link>
        <a href={chatHref} {...external} className={styles.outline} onClick={onChat("card")}>
          <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
          <span>{t("item.chatSeller")}</span>
        </a>
      </div>

      <div className={styles.secondary}>
        <a href={telLink(seller.phone)} className={styles.ghost} onClick={onCall}>
          <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
          <span>{t("item.call")}</span>
        </a>
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
