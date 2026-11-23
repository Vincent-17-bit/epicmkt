import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCommentDots, faStore } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { formatKes } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import { external } from "./links.js";
import styles from "../ItemDetail.module.css";

// The footer that stays at the bottom of the sheet. With something to order (a chosen combination, a quantity) it is one row: chat and
// visit-store as icon buttons, and "Order now" with the running total as the main button. Without one it is the two plain buttons.
export default function StickyNav({ ctx }) {
  const { item, seller, chatHref, onChat, onVisit, orderHref, order } = ctx;
  if (!item || !seller) return null;
  const total = order && Number.isFinite(order.total) ? formatKes(order.total) : "";
  if (orderHref) {
    return (
      <footer className={styles.footer} data-order="">
        <a href={chatHref} {...external} className={styles.iconBtn} data-tip={t("item.chatSeller")} onClick={onChat("footer")}>
          <FontAwesomeIcon icon={faCommentDots} aria-hidden="true" />
          <span className={styles.iconLabel} aria-hidden="true">{t("item.chatShort")}</span>
          <span className="sr-only">{t("item.chatSeller")}</span>
        </a>
        <Link to={`/b/${seller.slug}`} className={styles.iconBtn} data-tip={t("item.visitStore")} onClick={onVisit("footer")}>
          <FontAwesomeIcon icon={faStore} aria-hidden="true" />
          <span className={styles.iconLabel} aria-hidden="true">{t("item.visitShort")}</span>
          <span className="sr-only">{t("item.visitStore")}</span>
        </Link>
        <a href={orderHref} {...external} className={`${styles.chat} ${styles.order}`} data-testid="order-whatsapp" onClick={onChat("order")}>
          <FontAwesomeIcon icon={faWhatsapp} className={styles.icon} aria-hidden="true" />
          <span className={styles.orderLabel}>{t("item.orderWhatsapp")}</span>
          {total && <span className={styles.orderTotal} data-long={total.length > 12 ? "" : undefined}>{total}</span>}
        </a>
      </footer>
    );
  }
  return (
    <footer className={styles.footer}>
      <a href={chatHref} {...external} className={styles.chat} onClick={onChat("footer")}>
        <FontAwesomeIcon icon={faCommentDots} className={styles.icon} aria-hidden="true" />
        <span>{t("item.chatSeller")}</span>
      </a>
      <Link to={`/b/${seller.slug}`} className={styles.outline} onClick={onVisit("footer")}>
        <FontAwesomeIcon icon={faStore} className={styles.icon} aria-hidden="true" />
        <span>{t("item.visitStore")}</span>
      </Link>
    </footer>
  );
}
