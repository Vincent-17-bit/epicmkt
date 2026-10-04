import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { useCountdownLabel } from "../hooks/useCountdown.js";
import { t } from "../i18n/index.js";
import CountdownTiles from "./CountdownTiles.jsx";
import styles from "./FlashChip.module.css";

export default function FlashChip({ endsAt, className = "" }) {
  const label = useCountdownLabel(endsAt);
  return (
    <span className={`${styles.chip} ${className}`}>
      <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
      <span className={styles.sr}>
        {t("flash.label")}. {label}
      </span>
      <CountdownTiles endsAt={endsAt} variant="inline" />
    </span>
  );
}
