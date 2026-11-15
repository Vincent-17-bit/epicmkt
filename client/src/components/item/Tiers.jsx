import { useEffect, useId, useMemo, useState } from "react";
import { priceTiered, tierIndex, validateTiers } from "@epicmkt/shared";
import { kesText } from "../../lib/flash.js";
import { t } from "../../i18n/index.js";
import styles from "./Tiers.module.css";

const MAX_QTY = 1_000_000;
const fill = (key, v) => Object.entries(v).reduce((s, [k, x]) => s.replace(`{${k}}`, x), t(key));

/** The tiers that apply to what the buyer picked: the combination's own, else the item's. Null when there are none or they are not valid. */
export function tiersFor(item, variant) {
  const tiers = variant?.priceTiers ?? item?.priceTiers;
  const mode = item?.priceTierMode === "graduated" ? "graduated" : "whole";
  return Array.isArray(tiers) && tiers.length > 0 && validateTiers(tiers, mode).ok ? { tiers, mode } : null;
}

const plural = (unit, n) => (n === 1 || /s$/i.test(unit) ? unit : `${unit}s`);

const range = (tier) => (tier.maxQty === null || tier.maxQty === undefined ? fill("tiers.orMore", { from: tier.minQty }) : tier.maxQty === tier.minQty ? String(tier.minQty) : fill("tiers.range", { from: tier.minQty, to: tier.maxQty }));

/**
 * Price by quantity: the table of tiers, the one the buyer's quantity falls in, a hint about the next one, and the total, which follows the
 * quantity. "whole": every unit costs the price of the tier the quantity reaches. "graduated": each unit costs the price of its own band.
 */
export default function Tiers({ item, variant, qty: given = null, onQty = null }) {
  const uid = useId();
  const set = tiersFor(item, variant);
  // The box keeps what was typed (it may be empty for a moment); the quantity is always a whole number from 1.
  const [text, setText] = useState("1");
  const clamp = (n) => Math.min(MAX_QTY, Math.max(1, Math.floor(Number(n) || 1)));
  // The page may own the quantity (so the message to the seller carries it); alone, the table keeps its own.
  const controlled = given !== null && typeof onQty === "function";
  const qty = controlled ? clamp(given) : clamp(text);
  const setQty = (n) => { setText(String(clamp(n))); if (controlled) onQty(clamp(n)); };
  // When the page changes the quantity (a new item), the box follows it.
  useEffect(() => { if (controlled && clamp(text) !== clamp(given)) setText(String(clamp(given))); }, [given]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = plural(item?.unit || t("tiers.unit"), 2);
  const result = useMemo(() => (set ? priceTiered({ tiers: set.tiers, mode: set.mode, qty }) : null), [set, qty]);
  if (!set || !result) return null;
  const current = tierIndex(set.tiers, qty);

  return (
    <section className={styles.root} aria-labelledby={`${uid}-h`} data-testid="tiers">
      <h3 id={`${uid}-h`} className={styles.heading}>{t("tiers.heading")}</h3>
      <p className={styles.mode}>{t(set.mode === "graduated" ? "tiers.graduated" : "tiers.whole")}</p>
      <table className={styles.table}>
        <caption className={styles.sr}>{t("tiers.heading")}</caption>
        <thead><tr><th scope="col">{fill("tiers.colQty", { unit })}</th><th scope="col">{t("tiers.colPrice")}</th></tr></thead>
        <tbody>
          {set.tiers.map((tier, i) => (
            <tr key={tier.minQty} className={i === current ? styles.current : undefined} aria-current={i === current ? "true" : undefined}>
              <th scope="row">{range(tier)}{i === current && <span className={styles.badge}> {t("tiers.yours")}</span>}</th>
              <td>{fill("tiers.each", { price: kesText(tier.unitPrice) })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.picker}>
        <label htmlFor={`${uid}-q`} className={styles.label}>{fill("tiers.howMany", { unit })}</label>
        <div className={styles.stepper}>
          <button type="button" className={styles.step} aria-label={t("tiers.less")} disabled={qty <= 1} onClick={() => setQty(clamp(qty - 1))}>−</button>
          <input id={`${uid}-q`} className={styles.input} type="number" inputMode="numeric" min="1" max={MAX_QTY} step="1" value={text}
            onChange={(e) => { const next = e.target.value.replace(/[^0-9]/g, "").slice(0, 7); setText(next); if (controlled && next !== "") onQty(clamp(next)); }} onBlur={() => setQty(text)} />
          <button type="button" className={styles.step} aria-label={t("tiers.more")} disabled={qty >= MAX_QTY} onClick={() => setQty(clamp(qty + 1))}>+</button>
        </div>
      </div>

      <p className={styles.total} role="status" aria-live="polite" data-testid="tiers-total">
        <strong>{fill("tiers.total", { qty, unit: plural(item?.unit || t("tiers.unit"), qty), total: kesText(result.total) })}</strong>
        {set.mode === "graduated" && result.bands.length > 1 && <span className={styles.bands}> {result.bands.map((b) => `${b.qty} × ${kesText(b.unit)}`).join(" + ")}</span>}
      </p>
      {result.next && <p className={styles.next} data-testid="tiers-next">{fill("tiers.next", { more: result.next.more, price: kesText(result.next.unit) })}</p>}
    </section>
  );
}
