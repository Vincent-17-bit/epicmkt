import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCommentDots, faFlag, faPhone, faShareNodes, faStore } from "@fortawesome/free-solid-svg-icons";
import { formatDistance, telLink } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import styles from "./item.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

function Logo({ seller, large = false }) {
  return (
    <span className={`${styles.logo} ${large ? styles.logoLarge : ""}`}>
      {seller.logo ? <img src={seller.logo} alt="" className={styles.logoImg} decoding="async" loading="lazy" /> : seller.name.slice(0, 1)}
    </span>
  );
}

const Status = ({ open }) => (
  <span className={open ? styles.open : styles.closed}>
    <span className={styles.statusDot} aria-hidden="true" />
    {open ? t("item.open") : t("item.closed")}
  </span>
);

const Verified = () => <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title={t("item.verified")} aria-label={t("item.verified")} />;

export function StoreLine({ seller, distance }) {
  return (
    <p className={styles.storeLine}>
      <Logo seller={seller} />
      <Link to={`/b/${seller.slug}`} className={styles.storeName}>
        {seller.name}
      </Link>
      {seller.verified && <Verified />}
      <Status open={seller.isOpen} />
      {Number.isFinite(distance) && <span className={styles.muted}>{formatDistance(distance)}</span>}
    </p>
  );
}

export function StoreStrip({ seller, count, distance, chatHref, onChat, onVisit }) {
  return (
    <section className={`${styles.card} ${styles.strip}`} aria-label={t("item.soldBy")}>
      <div className={styles.stripMain}>
        <Logo seller={seller} large />
        <div className={styles.stripText}>
          <p className={styles.stripName}>
            <span>{seller.name}</span>
            {seller.verified && <Verified />}
          </p>
          <p className={styles.stripMeta}>
            <Status open={seller.isOpen} />
            {seller.townName && <span>{seller.townName}</span>}
            {Number.isFinite(distance) && <span>{formatDistance(distance)}</span>}
            {count > 0 && (
              <span>
                {count} {t("item.itemsCount")}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className={styles.stripActions}>
        <Link to={`/b/${seller.slug}`} className={styles.outline} onClick={onVisit}>
          <FontAwesomeIcon icon={faStore} aria-hidden="true" />
          <span>{t("item.visitStore")}</span>
        </Link>
        <a href={chatHref} {...external} className={styles.outline} onClick={onChat}>
          <FontAwesomeIcon icon={faCommentDots} aria-hidden="true" />
          <span>{t("item.chatSeller")}</span>
        </a>
      </div>
    </section>
  );
}

export function ItemActions({ seller, chatHref, onChat, onVisit, onCall, onShare, onReport }) {
  return (
    <div className={styles.actions}>
      <div className={styles.primary}>
        <a href={chatHref} {...external} className={styles.chat} onClick={onChat}>
          <FontAwesomeIcon icon={faCommentDots} aria-hidden="true" />
          <span>{t("item.chatSeller")}</span>
        </a>
        <Link to={`/b/${seller.slug}`} className={styles.outline} onClick={onVisit}>
          <FontAwesomeIcon icon={faStore} aria-hidden="true" />
          <span>{t("item.visitStore")}</span>
        </Link>
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
    </div>
  );
}
