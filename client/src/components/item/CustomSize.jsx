import { useId, useMemo, useState } from "react";
import { checkMeasurements, customPrice, customSizeMessage, formatKes } from "@epicmkt/shared";
import styles from "./CustomSize.module.css";

// "Made to measure" (Prompt 3.7). Shown when the seller turned it on for an option: the buyer gives the measurements the seller asked
// for, sees the price the seller's rule gives, and the line that goes to the seller says exactly what was chosen.
// Controlled by the item page through `onChange({ ok, values, price, message })`; it holds only what the buyer has typed.
export default function CustomSize({ config, itemName = "", onChange }) {
  const uid = useId();
  const [raw, setRaw] = useState({});
  const [touched, setTouched] = useState({});
  const check = useMemo(() => checkMeasurements(config, raw), [config, raw]);
  const price = check.ok ? customPrice(config, check.values) : null;
  const message = check.ok ? customSizeMessage(itemName, config, check.values, price, (n) => formatKes(n, { decimals: 0 })) : "";
  if (!config?.enabled || !config.fields?.length) return null;

  const set = (key, value) => {
    const next = { ...raw, [key]: value };
    setRaw(next);
    const c = checkMeasurements(config, next);
    const p = c.ok ? customPrice(config, c.values) : null;
    onChange?.({ ok: c.ok, values: c.values, price: p, message: c.ok ? customSizeMessage(itemName, config, c.values, p, (n) => formatKes(n, { decimals: 0 })) : "" });
  };

  return (
    <fieldset className={styles.box}>
      <legend className={styles.legend}>Made to measure</legend>
      <p className={styles.lead}>Give your measurements and the seller will make it to fit. Use cm, or type in for inches (for example 36 in).</p>
      <div className={styles.fields}>
        {config.fields.map((f) => {
          const err = touched[f.key] ? check.errors[f.key] : "";
          return (
            <div key={f.key} className={styles.field}>
              <label className={styles.label} htmlFor={`${uid}-${f.key}`}>{f.label} <span className={styles.unit}>({f.unit}){f.required === false ? ", optional" : ""}</span></label>
              <input id={`${uid}-${f.key}`} className={styles.input} inputMode="decimal" autoComplete="off" value={raw[f.key] ?? ""}
                aria-invalid={err ? "true" : undefined} aria-describedby={err ? `${uid}-${f.key}-e` : undefined}
                onChange={(e) => set(f.key, e.target.value)} onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))} />
              {err && <p id={`${uid}-${f.key}-e`} className={styles.error}>{err}</p>}
            </div>
          );
        })}
      </div>
      <div className={styles.result} role="status" aria-live="polite">
        {price !== null ? <><strong className={styles.price}>{formatKes(price, { decimals: 0 })}</strong><span className={styles.summary}>{message}</span></> : <span className={styles.summary}>Fill in the measurements to see the price.</span>}
      </div>
    </fieldset>
  );
}
