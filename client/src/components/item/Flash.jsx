import FlashBanner from "../FlashBanner.jsx";
import { t } from "../../i18n/index.js";
import { kesText } from "../../lib/flash.js";
import styles from "../ItemDetail.module.css";

// The flash-sale banner above the title, and the "sale ended" notice that holds for a few seconds after a sale stops.
export default function Flash({ ctx }) {
  const { item, shown, hold, bannerRef } = ctx;
  if (!item?.flash) return null;
  return (
    <div className={styles.collapse} data-open={hold?.leaving ? "false" : "true"}>
      <div className={styles.collapseInner}>
        <FlashBanner key={item.flash.sale.id} flash={item.flash} pricing={shown} unit={item.pricing?.unit} bannerRef={bannerRef} ended={Boolean(hold)} />
        {hold && (
          <p className={styles.endedNotice} role="status">
            {t("flash.endedNotice")}
            {hold.regularPrice !== null && ` ${kesText(hold.regularPrice)}`}
          </p>
        )}
      </div>
    </div>
  );
}
