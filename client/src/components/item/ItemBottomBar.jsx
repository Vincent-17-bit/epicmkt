import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCommentDots, faStore } from "@fortawesome/free-solid-svg-icons";
import { kesText } from "../../lib/flash.js";
import { priceParts } from "../../lib/itemView.js";
import { t } from "../../i18n/index.js";
import { FlashClock } from "./ItemFlash.jsx";
import styles from "./item.module.css";

export default function ItemBottomBar({ slug, shown, priceType, endsAt, chatHref, onChat, onVisit }) {
  const parts = priceParts(shown, priceType);
  const amount = parts.kind === "contact" ? t("item.contactForPrice") : parts.kind === "free" ? t("item.free") : kesText(shown.salePrice);

  return (
    <nav className={styles.bar} aria-label={t("item.bar")}>
      <div className={styles.barInfo}>
        <span className={styles.barPrice}>{amount}</span>
        {endsAt && <FlashClock endsAt={endsAt} className={styles.barClock} />}
      </div>
      <Link to={`/b/${slug}`} className={styles.barOutline} onClick={onVisit}>
        <FontAwesomeIcon icon={faStore} aria-hidden="true" />
        <span>{t("item.visitStore")}</span>
      </Link>
      <a href={chatHref} target="_blank" rel="noopener noreferrer" className={styles.barChat} onClick={onChat}>
        <FontAwesomeIcon icon={faCommentDots} aria-hidden="true" />
        <span>{t("item.chatSeller")}</span>
      </a>
    </nav>
  );
}
