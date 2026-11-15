import { useMemo } from "react";
import { flashOptionTable, flashVariantFields, formatKes } from "@epicmkt/shared";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";
import styles from "./flash.module.css";

const TYPES = [["percent", "% off"], ["amount_off", "KES off"], ["sale_price", "Sale price"]];

/** The fields a sale sends for its options, from the picker state (nothing for an item without options). */
export const variantFieldsOf = (target, chosen) => flashVariantFields(target, chosen);

/**
 * Per-option part of the new-sale form: every option or only some, a discount per chosen option, and the before and after table with the
 * lowest sale price. The same rules as the database run on every change, so a refused target shows here before the seller presses Start.
 */
export default function FlashOptions({ options, sale, target, onTarget, chosen, onChosen }) {
  const table = useMemo(
    () => flashOptionTable(options, { discountType: sale.type, discountValue: sale.value, ...flashVariantFields(target, chosen) }),
    [options, sale.type, sale.value, target, chosen]
  );
  const waiting = !(Number(sale.value) > 0);
  const pick = (combo, on) => onChosen(on ? { ...chosen, [combo]: { type: sale.type, value: sale.value || "" } } : Object.fromEntries(Object.entries(chosen).filter(([k]) => k !== combo)));
  const setOwn = (combo, patch) => onChosen({ ...chosen, [combo]: { ...chosen[combo], ...patch } });

  return (
    <fieldset className={styles.fieldset} data-testid="fs-options">
      <legend>Which options</legend>
      <div className={styles.radios}>
        <label className={styles.radio}><input type="radio" name="fs-target" checked={target === "all"} onChange={() => onTarget("all")} />Every option</label>
        <label className={styles.radio}><input type="radio" name="fs-target" checked={target === "chosen"} onChange={() => onTarget("chosen")} />Only some options</label>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.optionTable}>
          <caption className={styles.srOnly}>Prices before and after the sale, for each option</caption>
          <thead>
            <tr>
              {target === "chosen" && <th scope="col">On sale</th>}
              <th scope="col">Option</th><th scope="col">Now</th>
              {target === "chosen" && <th scope="col">Discount</th>}
              <th scope="col">In the sale</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => {
              const own = chosen[r.combo];
              return (
                <tr key={r.combo} data-sold={r.sold ? "yes" : "no"}>
                  {target === "chosen" && (
                    <td><input type="checkbox" aria-label={`Put ${r.label} on sale`} checked={Boolean(own)} disabled={!r.sold} onChange={(e) => pick(r.combo, e.target.checked)} /></td>
                  )}
                  <th scope="row">{r.label}{!r.sold && <span className={ui.muted}> (not sold)</span>}</th>
                  <td>{r.regular === null ? "No price" : formatKes(r.regular)}</td>
                  {target === "chosen" && (
                    <td>
                      {own ? (
                        <span className={styles.ownDiscount}>
                          <select aria-label={`Discount type for ${r.label}`} className={ui.input} value={own.type} onChange={(e) => setOwn(r.combo, { type: e.target.value })}>
                            {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                          <input aria-label={`Discount for ${r.label}`} className={ui.input} type="number" inputMode="numeric" min="1" value={own.value} onChange={(e) => setOwn(r.combo, { value: e.target.value })} />
                        </span>
                      ) : <span className={ui.muted}>Normal price</span>}
                    </td>
                  )}
                  <td data-testid={`fs-after-${r.combo}`}>{r.sale !== null ? <strong>{formatKes(r.sale)} <span className={ui.muted}>(−{r.percent}%)</span></strong> : <span className={ui.muted}>{r.sold ? "Normal price" : "Not sold"}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {table.lowest !== null && <p className={styles.preview} data-testid="fs-lowest">Lowest sale price: {formatKes(table.lowest)}</p>}
      {!table.ok && !(target === "chosen" && Object.keys(chosen).length === 0 && waiting) && !waiting && <p className={ui.error} role="alert">{errorText({ code: table.error })}{table.errorCombo ? ` (${table.rows.find((r) => r.combo === table.errorCombo)?.label ?? ""})` : ""}</p>}
      {target === "chosen" && Object.keys(chosen).length === 0 && <p className={ui.muted}>Tick the options that go on sale. The discount above is their starting point.</p>}
    </fieldset>
  );
}
