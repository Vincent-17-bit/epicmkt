import { useMemo, useState } from "react";
import { AVAILABILITY_LABELS, LISTING_AVAILABILITY, ROUNDING_RULE, formatKes, parsePercent, previewPriceChange } from "@epicmkt/shared";
import Dialog from "./Dialog.jsx";
import styles from "./listings.module.css";

export function MoveDialog({ open, onClose, sections, count, onApply }) {
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Move to section">
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); onApply({ section: value }); }}>
        <label className={styles.field}>
          <span>Section name</span>
          <input list="section-options" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} />
          <datalist id="section-options">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <p className={styles.muted}>{count} {count === 1 ? "item" : "items"} will move. Leave empty to remove the section.</p>
        <button type="submit" className={styles.primaryBtn}>Move</button>
      </form>
    </Dialog>
  );
}

export function AvailabilityDialog({ open, onClose, count, onApply }) {
  const [value, setValue] = useState("available");
  return (
    <Dialog open={open} onClose={onClose} title="Set availability">
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); onApply({ availability: value }); }}>
        <label className={styles.field}>
          <span>Availability</span>
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            {LISTING_AVAILABILITY.map((a) => <option key={a} value={a}>{AVAILABILITY_LABELS[a]}</option>)}
          </select>
        </label>
        <p className={styles.muted}>{count} {count === 1 ? "item" : "items"} will change. Items that track stock keep following their stock count.</p>
        <button type="submit" className={styles.primaryBtn}>Apply</button>
      </form>
    </Dialog>
  );
}

export function PriceDialog({ open, onClose, items, onApply }) {
  const [direction, setDirection] = useState("raise");
  const [text, setText] = useState("10");
  const parsed = parsePercent(text);
  const preview = useMemo(() => (parsed.ok ? previewPriceChange(items, parsed.value, direction) : { rows: [], skipped: [] }), [items, parsed.ok, parsed.value, direction]);
  return (
    <Dialog open={open} onClose={onClose} title="Change prices" wide>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (parsed.ok && preview.rows.length) onApply({ percent: parsed.value, direction }); }}>
        <div className={styles.inline}>
          <label className={styles.field}>
            <span>Change</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="raise">Raise prices</option>
              <option value="lower">Lower prices</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>By percent</span>
            <input type="number" inputMode="decimal" min="0.01" max="500" step="0.01" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={parsed.ok ? undefined : "true"} aria-describedby="percent-help" />
          </label>
        </div>
        <p id="percent-help" className={parsed.ok ? styles.muted : styles.error} role={parsed.ok ? undefined : "alert"}>{parsed.ok ? ROUNDING_RULE : parsed.error}</p>
        <p role="status" data-testid="price-summary">
          {preview.rows.length} {preview.rows.length === 1 ? "item" : "items"} will change{preview.skipped.length > 0 ? `, ${preview.skipped.length} will be left as they are` : ""}.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Price changes before and after</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td>{formatKes(r.before.price)}{r.before.priceMax !== null ? ` to ${formatKes(r.before.priceMax)}` : ""}</td>
                  <td data-testid={`after-${r.id}`}>{formatKes(r.after.price)}{r.after.priceMax !== null ? ` to ${formatKes(r.after.priceMax)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.skipped.length > 0 && (
            <ul className={styles.skipped} aria-label="Items left unchanged">
              {preview.skipped.map((s) => <li key={s.id}>{s.name}: {s.reason}</li>)}
            </ul>
          )}
        </div>
        <button type="submit" className={styles.primaryBtn} disabled={!parsed.ok || preview.rows.length === 0}>Apply to {preview.rows.length} {preview.rows.length === 1 ? "item" : "items"}</button>
      </form>
    </Dialog>
  );
}
