import { useId, useState } from "react";
import { amountText, checkQuantity, formatKes, formatAmount, perUnitText } from "@epicmkt/shared";
import Tiers, { tiersFor } from "./Tiers.jsx";
import { quantityInfo } from "../../lib/itemView.js";
import { t } from "../../i18n/index.js";
import styles from "./Quantity.module.css";

const fill = (key, v) => Object.entries(v).reduce((s, [k, x]) => s.replace(`{${k}}`, x), t(key));

/**
 * Slot for quantity, right after Offers. Three shapes, all driven by the one quantity the page keeps (ctx.qty):
 *   - an item with quantity-tier prices: the tier table (its own quantity box follows the page's),
 *   - a typed item that counts units or a measure (kg, m): a stepper with the total beside it,
 *   - anything else (no type, or a type with no quantity): nothing at all, and the page is unchanged.
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
  const qty = ctx.qty;
  const order = ctx.order;
  const [text, setText] = useState(null);   // what is being typed; null = show the quantity itself
  const [said, setSaid] = useState("");
  const apply = (value) => {
    const checked = checkQuantity(mode, value, { quantity: measure ? { min: rules.min, step: rules.step, unit } : null, stock: rules.max });
    ctx.setQty(checked.value);
    setText(null);
    setSaid(checked.reason === "above_max" ? fill("qty.max", { n: formatAmount(rules.max) }) : checked.reason === "below_min" ? fill("qty.min", { n: amountText(rules.min, unit) }) : "");
  };
  const step = (dir) => apply(Number((qty + dir * rules.step).toFixed(3)));
  const shown = text ?? formatAmount(qty);
  const total = formatKes(order.total);
  return (
    <section className={styles.root} aria-labelledby={`${uid}-h`} data-testid="quantity">
      <h3 id={`${uid}-h`} className={styles.heading}>{t("qty.heading")}</h3>
      <div className={styles.picker}>
        <label htmlFor={`${uid}-q`} className={styles.label}>{measure ? fill("qty.howMuch", { unit }) : t("qty.howMany")}</label>
        <div className={styles.stepper}>
          <button type="button" className={styles.step} aria-label={t("qty.less")} disabled={qty <= rules.min} onClick={() => step(-1)}>−</button>
          <input
            id={`${uid}-q`} className={styles.input} type="text" inputMode={measure ? "decimal" : "numeric"} autoComplete="off" value={shown}
            onChange={(e) => setText(e.target.value.replace(measure ? /[^0-9.]/g : /[^0-9-]/g, "").slice(0, 8))}
            onBlur={() => { if (text !== null) apply(text); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(shown); } }}
          />
          <button type="button" className={styles.step} aria-label={t("qty.more")} disabled={rules.max !== null && qty >= rules.max} onClick={() => step(1)}>+</button>
        </div>
      </div>
      <p className={styles.total} role="status" aria-live="polite" data-testid="quantity-total">
        <strong>{measure ? fill("qty.measureTotal", { per: perUnitText(order.unit, unit), amount: amountText(qty, unit), total }) : fill("qty.total", { total, qty })}</strong>
      </p>
      {said && <p className={styles.hint} role="status">{said}</p>}
    </section>
  );
}
