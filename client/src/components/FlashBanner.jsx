import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { useCountdownLabel, useUrgency } from "../hooks/useCountdown.js";
import { formatEndsAt, kesText, urgencyLabel } from "../lib/flash.js";
import { t } from "../i18n/index.js";
import CountdownTiles from "./CountdownTiles.jsx";
import FuseBar from "./FuseBar.jsx";
import styles from "./FlashBanner.module.css";

export default function FlashBanner({ flash, pricing, unit, bannerRef }) {
  const { sale } = flash;
  const urgency = useUrgency(sale.endsAt);
  const remaining = useCountdownLabel(sale.endsAt);
  const saving = pricing && pricing.savings > 0;

  return (
    <div className={styles.wrap}>
      <section ref={bannerRef} className={styles.banner} data-urgency={urgency} aria-label={t("item.flash")}>
        <div className={styles.top}>
          <span className={styles.label}>
            <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
            {urgencyLabel(urgency)}
          </span>
          {sale.headline && <span className={styles.headline}>{sale.headline}</span>}
        </div>
        <div className={styles.timer}>
          <CountdownTiles endsAt={sale.endsAt} variant="banner" />
          <p className={styles.ends}>
            {t("flash.endsOn")} {formatEndsAt(sale.endsAt)}
          </p>
        </div>
        <span className={styles.sr} role="status">
          {remaining}
        </span>
        <FuseBar startsAt={sale.startsAt} endsAt={sale.endsAt} animate className={styles.fuse} />
      </section>

      {pricing && (
        <div className={styles.panel}>
          <p className={styles.price}>
            <span className={styles.cur}>{t("flash.currency")}</span>
            {Number(pricing.salePrice).toLocaleString("en-KE")}
            {unit && <span className={styles.unit}> / {unit}</span>}
          </p>
          {saving && (
            <p className={styles.was}>
              <s>
                <span className={styles.sr}>{t("item.was")} </span>
                {kesText(pricing.regularPrice)}
              </s>
              <span className={styles.saved}>
                {t("flash.youSave")} {kesText(pricing.savings)} ({pricing.discountPercent}%)
              </span>
            </p>
          )}
          {sale.quantityNote && <span className={styles.note}>{sale.quantityNote}</span>}
        </div>
      )}
    </div>
  );
}
