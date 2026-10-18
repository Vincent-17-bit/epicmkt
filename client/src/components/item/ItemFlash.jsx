import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { useCountdown, useCountdownLabel } from "../../hooks/useCountdown.js";
import { pad2 } from "../../lib/flash.js";
import { t } from "../../i18n/index.js";
import styles from "./item.module.css";

export function flashClock(parts) {
  const hms = `${pad2(parts.h)} : ${pad2(parts.m)} : ${pad2(parts.s)}`;
  return parts.d > 0 ? `${parts.d}d ${hms}` : hms;
}

export function FlashClock({ endsAt, className }) {
  const parts = useCountdown(endsAt);
  if (parts.urgency === "ended") return null;
  return (
    <time dateTime={endsAt} className={className} aria-hidden="true">
      {flashClock(parts)}
    </time>
  );
}

export default function ItemFlashRow({ endsAt }) {
  const parts = useCountdown(endsAt);
  const label = useCountdownLabel(endsAt);
  if (parts.urgency === "ended") return null;
  return (
    <div className={styles.flashRow} data-testid="flash-row">
      <span className={styles.flashLabel}>
        <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
        {t("flash.label")}
      </span>
      <span className={styles.flashTimer}>
        {t("item.closingIn")}{" "}
        <time dateTime={endsAt} className={styles.clock} aria-hidden="true">
          {flashClock(parts)}
        </time>
      </span>
      <span className={styles.sr} role="status">
        {label}
      </span>
    </div>
  );
}
