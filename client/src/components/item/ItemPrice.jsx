import { kesText } from "../../lib/flash.js";
import { priceParts } from "../../lib/itemView.js";
import { t } from "../../i18n/index.js";
import styles from "./item.module.css";

export default function ItemPrice({ shown, priceType, unit }) {
  const parts = priceParts(shown, priceType);

  if (parts.kind === "contact") return <p className={styles.priceMain}>{t("item.contactForPrice")}</p>;
  if (parts.kind === "free") return <p className={styles.priceMain}>{t("item.free")}</p>;

  const suffix = unit ? <span className={styles.unit}> / {unit}</span> : null;
  const prefix = parts.prefix ? <span className={styles.from}>{t("item.priceFrom")} </span> : null;

  if (parts.kind === "regular") {
    return (
      <div className={styles.price}>
        <p className={styles.priceMain}>
          {prefix}
          {kesText(parts.amount)}
          {suffix}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.price}>
      <p className={styles.priceMain} data-sale="true">
        {prefix}
        {kesText(shown.salePrice)}
        {suffix}
      </p>
      <p className={styles.priceMeta}>
        <s className={styles.was}>
          <span className={styles.sr}>{t("item.was")} </span>
          {kesText(shown.regularPrice)}
        </s>
        <span className={styles.chip}>
          {shown.discountPercent}% {t("item.percentOff")}
        </span>
        <span className={styles.save}>
          {t("item.save")} {kesText(shown.savings)}
        </span>
      </p>
    </div>
  );
}
