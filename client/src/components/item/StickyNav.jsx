import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCommentDots, faStore } from "@fortawesome/free-solid-svg-icons";
import { t } from "../../i18n/index.js";
import { external } from "./links.js";
import styles from "../ItemDetail.module.css";

// The footer that stays at the bottom: chat with the seller, visit the store.
export default function StickyNav({ ctx }) {
  const { item, seller, chatHref, onChat, onVisit } = ctx;
  if (!item || !seller) return null;
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
