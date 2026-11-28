import { useId, useState } from "react";
import { amountText, checkQuantity, formatAmount } from "@epicmkt/shared";
import { t } from "../i18n/index.js";
import styles from "./QuantityStepper.module.css";

const fill = (key, v) => Object.entries(v).reduce((s, [k, x]) => s.replace(`{${k}}`, x), t(key));

/**
 * The one quantity control: minus, the amount, plus. Used on the item page ("md") and in the Saved drawer ("sm").
 *   mode      "units" | "measure"
 *   rules     { min, step, max, unit } from quantityRules (max null = no limit)
 *   value     the quantity now
 *   onChange  called with a quantity already rounded and held between the limits by checkQuantity
 * Typed values apply on blur or Enter. A limit that was hit is explained in a short hint (hints={false} hides it: the drawer says it on the line).
 */
export default function QuantityStepper({ mode = "units", rules, value, onChange, size = "md", label, hints = true, id }) {
  const uid = useId();
  const measure = mode === "measure";
  const unit = rules?.unit ?? null;
  const [text, setText] = useState(null); // what is being typed; null = show the quantity itself
  const [said, setSaid] = useState("");
  const apply = (next) => {
    const checked = checkQuantity(mode, next, { quantity: measure ? { min: rules.min, step: rules.step, unit } : null, stock: rules.max });
    onChange(checked.value);
    setText(null);
    setSaid(checked.reason === "above_max" ? fill("qty.max", { n: formatAmount(rules.max) }) : checked.reason === "below_min" ? fill("qty.min", { n: amountText(rules.min, unit) }) : "");
  };
  const step = (dir) => apply(Number((value + dir * rules.step).toFixed(3)));
  const shown = text ?? formatAmount(value);
  const name = label ?? (measure ? fill("qty.howMuch", { unit }) : t("qty.howMany"));
  return (
    <div className={styles.root} data-size={size} data-no-swipe>
      <div className={styles.stepper} role="group" aria-label={name}>
        <button type="button" className={styles.step} aria-label={t("qty.less")} disabled={value <= rules.min} onClick={() => step(-1)}>
          <span aria-hidden="true">−</span>
        </button>
        <input
          id={id ?? `${uid}-q`}
          className={styles.input}
          type="text"
          inputMode={measure ? "decimal" : "numeric"}
          autoComplete="off"
          aria-label={name}
          value={shown}
          onChange={(e) => setText(e.target.value.replace(measure ? /[^0-9.]/g : /[^0-9-]/g, "").slice(0, 8))}
          onBlur={() => {
            if (text !== null) apply(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(shown);
            }
          }}
        />
        <button type="button" className={styles.step} aria-label={t("qty.more")} disabled={rules.max !== null && value >= rules.max} onClick={() => step(1)}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {hints && said && (
        <p className={styles.hint} role="status">
          {said}
        </p>
      )}
    </div>
  );
}
