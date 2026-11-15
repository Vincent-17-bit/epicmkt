import { useId } from "react";
import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { TIER_LIMITS } from "@epicmkt/shared";
import { CheckRow, Field } from "./parts.jsx";
import { blankTiers, tierIssues, tierPreview } from "./model/tiers.js";
import styles from "./editor.module.css";

const MODES = [
  ["whole", "Whole order", "Every unit costs the price of the tier the quantity reaches. 50 pages at KES 7 from 11 = 50 × KES 7."],
  ["graduated", "Each band", "Each unit costs the price of its own band. 50 pages = 10 at the first price + 40 at the second."]
];

/** "From quantity, unit price" rows with the mode and a live preview. Shown by the price step only for a price type that allows tiers. */
export default function TiersEditor({ state, onChange, unit = "item", serverError = "" }) {
  const uid = useId();
  const on = Boolean(state);
  const issues = on ? tierIssues(state) : null;
  const preview = on ? tierPreview(state, 50, unit) : null;
  const setRow = (i, key, text) => onChange({ ...state, rows: state.rows.map((r, n) => (n === i ? { ...r, [key]: text } : r)) });

  return (
    <div className={styles.subBlock} data-area="tiers">
      <h3 className={styles.subTitle}>Quantity prices (optional)</h3>
      <CheckRow checked={on} onChange={(e) => onChange(e.target.checked ? blankTiers() : null)} data-focus="tiers">The more they buy, the less each one costs</CheckRow>
      {!on && <p className={styles.hint}>For things sold by the page, piece or metre, like printing or banners. Customers see a table of prices and their total follows the quantity.</p>}
      {on && (
        <>
          <fieldset className={styles.stockBox}>
            <legend className={styles.label}>How is the price worked out?</legend>
            {MODES.map(([key, label, help]) => (
              <label key={key} className={styles.modeRow}>
                <input type="radio" name={`${uid}-mode`} checked={state.mode === key} onChange={() => onChange({ ...state, mode: key })} />
                <span><strong>{label}</strong><span className={styles.hint}> {help}</span></span>
              </label>
            ))}
          </fieldset>

          <table className={styles.tierTable}>
            <caption className={styles.srOnly}>Quantity prices</caption>
            <thead><tr><th scope="col">From quantity</th><th scope="col">Price each (KES)</th><th scope="col"><span className={styles.srOnly}>Remove</span></th></tr></thead>
            <tbody>
              {state.rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <Field name={`tier-${i}-from`} label={`Tier ${i + 1} from quantity`} area="tiers" inputMode="numeric" pattern="[0-9]*" maxLength={7} autoComplete="off"
                      value={r.from} error={issues.rows[i].from} onChange={(e) => setRow(i, "from", e.target.value)} />
                  </td>
                  <td>
                    <Field name={`tier-${i}-price`} label={`Tier ${i + 1} price each (KES)`} area="tiers" inputMode="numeric" pattern="[0-9]*" maxLength={10} autoComplete="off"
                      value={r.price} error={issues.rows[i].price} onChange={(e) => setRow(i, "price", e.target.value)} />
                  </td>
                  <td>
                    {state.rows.length > 2 && (
                      <button type="button" className={styles.linkBtn} aria-label={`Remove tier ${i + 1}`} onClick={() => onChange({ ...state, rows: state.rows.filter((_, n) => n !== i) })}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.rows.length < TIER_LIMITS.tiers && (
            <button type="button" className={styles.btnGhost} data-focus="add-tier" onClick={() => onChange({ ...state, rows: [...state.rows, { from: "", price: "" }] })}>Add another quantity price</button>
          )}

          {issues.list.length > 0 && (
            <ul className={styles.errorList} role="alert">{issues.list.map((m) => <li key={m}>{m}</li>)}</ul>
          )}
          {serverError && <p role="alert" className={styles.errorText}>{serverError}</p>}
          {preview && <p className={styles.summary} data-testid="tier-preview" aria-live="polite">{preview.text}</p>}
          <p className={styles.hint}>Each tier runs until the next one starts. The last one has no end. Quantity prices need the price type “Starting from”.</p>
        </>
      )}
    </div>
  );
}
