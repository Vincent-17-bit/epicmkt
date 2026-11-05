import { formatKes } from "@epicmkt/shared";
import { itemT } from "./labels.js";
import styles from "./ItemView.module.css";

// The Header slot: brand, title, short description and the price. ItemView keeps the wrapper (the "info" block) around it.
// `marks` is the optional callback that tags parts for the design tool (data-hl); it is not used by the shop.
export default function ItemHeader({ item, shown, t = itemT, Heading = "h2", headingRef, headingId = "item-title", marks }) {
  const mark = (part) => marks?.(part);
  return (
    <>
      {item.brand && <p className={styles.brand} data-hl={mark("brand")}>{item.brand}</p>}
      <Heading id={headingId} ref={headingRef} tabIndex={-1} className={styles.title} data-hl={mark("name")}>
        {item.name}
      </Heading>
      {item.shortDescription && <p className={styles.description} data-hl={mark("short")}>{item.shortDescription}</p>}

      {shown && !item.flash && (
        <div className={styles.priceBlock} data-hl={mark("price")}>
          {shown.savings > 0 ? (
            <>
              <p className={styles.salePrice}>
                {formatKes(shown.salePrice)}
                {item.pricing.unit && <span className={styles.unit}> / {item.pricing.unit}</span>}
                <span className={styles.saleChip}>
                  {t("item.sale")} -{shown.discountPercent}%
                </span>
              </p>
              <p className={styles.was}>
                <s>
                  <span className="sr-only">{t("item.was")} </span>
                  {formatKes(shown.regularPrice)}
                </s>
                <span>
                  {t("item.save")} {formatKes(shown.savings)}
                </span>
              </p>
            </>
          ) : (
            <p className={styles.price}>
              {formatKes(shown.regularPrice)}
              {item.pricing.unit && <span className={styles.unit}> / {item.pricing.unit}</span>}
            </p>
          )}
        </div>
      )}
    </>
  );
}
