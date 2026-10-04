import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faTag } from "@fortawesome/free-solid-svg-icons";
import { t } from "../i18n/index.js";
import styles from "./PromoChip.module.css";

export default function PromoChip({ promo, className = "" }) {
  const flash = promo?.flash ?? 0;
  const offers = promo?.offers ?? 0;
  const total = flash + offers;
  if (total === 0) return null;
  const isFlash = flash > 0;
  const extra = total - 1;
  return (
    <span className={`${styles.chip} ${isFlash ? styles.flash : styles.offer} ${className}`}>
      <FontAwesomeIcon icon={isFlash ? faBolt : faTag} aria-hidden="true" />
      <span>{isFlash ? t("flash.promo") : t("flash.offer")}</span>
      {extra > 0 && <span>+{extra}</span>}
    </span>
  );
}
