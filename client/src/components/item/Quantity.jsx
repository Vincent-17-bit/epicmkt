import { useId } from "react";
import { formatKes } from "@epicmkt/shared";
import QuantityStepper from "../QuantityStepper.jsx";
import Tiers, { tiersFor } from "./Tiers.jsx";
import { quantityInfo } from "../../lib/itemView.js";
import { t } from "../../i18n/index.js";
import styles from "./Quantity.module.css";

const fill = (key, v) => Object.entries(v).reduce((s, [k, x]) => s.replace(`{${k}}`, x), t(key));

/**
 * Slot for quantity, right after Offers. Three shapes, all driven by the one quantity the page keeps (ctx.qty):
 *   - an item with quantity-tier prices: the tier table (its own quantity box follows the page's),
 *   - a priced item that counts units (any item without a type) or a measure (kg, m): the stepper; the total shows in the price at the top,
 *   - a "none" item or a service: nothing at all, and the page is unchanged.
 */
export default function Quantity({ ctx, slot }) {
  const item = slot?.item;
  const variant = ctx?.option?.variant ?? null;
  if (tiersFor(item, variant)) return <Tiers item={item} variant={variant} qty={ctx?.qty ?? null} onQty={ctx?.setQty ?? null} />;
  const info = quantityInfo(item, variant);
  // A combination that cannot be bought (not sold, sold out, switched off) has no total to show: the no-match box above says
  // so and offers the closest ones instead.
  if (!info || !ctx?.order || ctx?.option?.unmatched) return null;
  return <Stepper item={item} info={info} ctx={ctx} />;
}

function Stepper({ item, info, ctx }) {
  const uid = useId();
  const { rules, mode, unit } = info;
  const measure = mode === "measure";
  const total = formatKes(ctx.order.total);
  // The sum behind the price is never shown. The buyer sees the result in the price at the top of the page; a screen reader is told it here.
  return (
    <section className={styles.root} aria-labelledby={`${uid}-h`} data-testid="quantity">
      <h3 id={`${uid}-h`} className={styles.heading}>{t("qty.heading")}</h3>
      <div className={styles.picker}>
        <span className={styles.label}>{measure ? fill("qty.howMuch", { unit }) : t("qty.howMany")}</span>
        <QuantityStepper mode={mode} rules={rules} value={ctx.qty} onChange={ctx.setQty} size="md" />
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="quantity-total">{fill("qty.announce", { total })}</p>
    </section>
  );
}
