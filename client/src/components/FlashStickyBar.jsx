import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { kesText } from "../lib/flash.js";
import { t } from "../i18n/index.js";
import CountdownTiles from "./CountdownTiles.jsx";
import styles from "./FlashStickyBar.module.css";

export default function FlashStickyBar({ endsAt, price, visible }) {
  return (
    <div className={styles.anchor}>
      <div className={styles.bar} data-visible={visible ? "true" : "false"} aria-hidden="true">
        <FontAwesomeIcon icon={faBolt} />
        <CountdownTiles endsAt={endsAt} variant="inline" />
        <span>{t("flash.left")}</span>
        <span className={styles.dash}>-</span>
        <span className={styles.price}>{kesText(price)}</span>
      </div>
    </div>
  );
}
