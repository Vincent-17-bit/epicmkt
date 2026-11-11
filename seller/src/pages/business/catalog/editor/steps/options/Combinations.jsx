import { useId } from "react";
import { formatKes as kes, liveRows, priceWarnings, rowKeyOf, setDefault, setRow, setSold, summarize, summaryText } from "@epicmkt/shared";
import PriceTools from "./PriceTools.jsx";
import ed from "../../editor.module.css";
import s from "./options.module.css";

const formatKes = (n) => kes(n, { decimals: 0 });
const labelOf = (options, choice) => options.axes.map((a) => a.values.find((v) => v.id === choice[a.key])?.label).filter(Boolean).join(" / ");

// The tiles: what the seller is putting on sale, at a glance. One sentence for screen readers, announced politely when it changes.
export function SummaryTiles({ options, itemPrice }) {
  const sum = summarize(options, itemPrice);
  return (
    <div role="status" aria-live="polite">
      <span className={ed.sr}>{summaryText(sum, formatKes)}</span>
      <div className={s.stats} aria-hidden="true">
        <div className={s.stat}><span className={s.statNum}>{sum.combos}</span><span className={s.statLabel}>on sale</span></div>
        <div className={s.stat} data-tone={sum.inStock < sum.combos ? "warn" : undefined}><span className={s.statNum}>{sum.inStock}</span><span className={s.statLabel}>in stock</span></div>
        <div className={s.stat}><span className={s.statNum}>{sum.from === null ? "None" : formatKes(sum.from)}</span><span className={s.statLabel}>lowest price</span></div>
      </div>
    </div>
  );
}

// One row per combination. This list is the single source of truth: prices, stock, "Not sold" and the default all live here.
export default function Combinations({ options, set, errors = {}, announce, itemPrice, hidePrice = false }) {
  const uid = useId();
  const rows = liveRows(options);
  if (rows.length === 0) return null;
  const sum = summarize(options, itemPrice);
  const warn = priceWarnings(options);
  return (
    <section className={s.stack} aria-labelledby={`${uid}-h`}>
      <div className={s.comboHead}>
        <h3 id={`${uid}-h`} className={s.comboTitle}>Prices and stock</h3>
        <p className={s.hint}>{sum.notSold > 0 ? `${sum.notSold} not sold` : "Every combination is on sale"}</p>
      </div>
      <p className={s.hint}>
        {hidePrice ? "Prices are set above. " : `Leave a price empty to use the item price${itemPrice ? ` (KES ${itemPrice})` : ""}. `}Leave stock empty if you do not count it; at 0 the combination shows as sold out.
      </p>
      {!hidePrice && <PriceTools options={options} set={set} announce={announce} />}
      {errors.rows && <p className={ed.error} data-focus="opt-rows" tabIndex={-1}>{errors.rows}</p>}
      <ul className={s.combos}>
        {rows.map((r) => {
          const key = rowKeyOf(options, r.choice);
          const name = labelOf(options, r.choice);
          const err = (f) => errors[`row:${key}:${f}`];
          const cell = (f, label, props = {}) => (
            <label className={s.cell}>
              <span aria-hidden="true">{label}</span>
              <input data-focus={`opt-row:${key}:${f}`} aria-label={`${name} ${label.toLowerCase()}`} value={r[f]} disabled={!r.sold} autoComplete="off" aria-invalid={err(f) ? "true" : undefined} onChange={(e) => set(setRow(options, key, { [f]: e.target.value }))} {...props} />
              {err(f) && <span className={s.cellError} role="alert">{err(f)}</span>}
            </label>
          );
          return (
            <li key={key} className={s.combo} data-sold={r.sold ? "true" : "false"}>
              <div className={s.comboTop}>
                <p className={s.comboName}>{name}{options.defaultKey === key && <span className={`${s.tag} ${s.tagDefault}`}>Shown first</span>}{!r.sold && <span className={s.tag}>Not sold</span>}</p>
              </div>
              <div className={s.cells}>
                {!hidePrice && cell("price", "Price", { inputMode: "decimal", placeholder: itemPrice ? String(itemPrice) : "" })}
                {cell("salePrice", "Sale price", { inputMode: "decimal" })}
                {cell("stock", "Stock", { inputMode: "numeric", maxLength: 6 })}
                {!hidePrice && warn[key] && !err("price") && <span className={s.cellWarn} role="note">{warn[key]}</span>}
                {err("specs") && <span className={s.cellError} role="alert">{err("specs")}</span>}
              </div>
              <div className={s.comboFoot}>
                <label className={s.check}>
                  <input type="checkbox" checked={!r.sold} onChange={(e) => { set(setSold(options, key, !e.target.checked)); announce(`${name} ${e.target.checked ? "marked not sold" : "back on sale"}.`); }} />
                  Not sold<span className={ed.sr}>: {name}</span>
                </label>
                <label className={s.check}>
                  <input type="radio" name={`${uid}-default`} checked={options.defaultKey === key} disabled={!r.sold} onChange={() => set(setDefault(options, key))} />
                  Show first<span className={ed.sr}>: {name}</span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
