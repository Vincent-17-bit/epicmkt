import { useMemo, useState } from "react";
import { AVAILABILITY_OPTIONS, DB_AVAILABILITY, formatKes, previewPriceChange, ROUNDING_RULE, validatePercent } from "@epicmkt/shared";
import Modal from "./Modal.jsx";
import { useProductTypes } from "./editor/steps/useProductTypes.js";
import { priceText } from "./cardItem.js";
import styles from "./catalog.module.css";

const DB_OPTIONS = AVAILABILITY_OPTIONS.filter((o) => DB_AVAILABILITY.includes(o.key));
const kes = (n) => (n === null || n === undefined ? "none" : formatKes(n));

export function PriceDialog({ open, items, onClose, onApply }) {
  const [percent, setPercent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = percent === "" ? null : validatePercent(percent);
  const preview = useMemo(() => (check?.ok ? previewPriceChange(items, check.value) : null), [items, check]);
  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      await onApply(check.value);
    } catch (e) {
      setError(e.message || "Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change prices"
      labelId="price-title"
      wide
      footer={
        <>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primary} disabled={!preview || preview.affected === 0 || busy} onClick={apply}>
            {preview && preview.affected > 0 ? `Change ${preview.affected} ${preview.affected === 1 ? "price" : "prices"}` : "Change prices"}
          </button>
        </>
      }
    >
      <label className={styles.stack}>
        <span>Percent change (use a minus sign to lower prices)</span>
        <input className={styles.text} type="number" step="0.1" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Percent change" aria-invalid={check ? !check.ok : false} />
      </label>
      {check && !check.ok && <p className={styles.err} role="alert">{check.message}</p>}
      <p className={styles.hint}>{ROUNDING_RULE}</p>
      {error && <p className={styles.err} role="alert">{error}</p>}
      {preview && (
        <div data-testid="price-preview">
          <p className={styles.hint}>
            {preview.affected} {preview.affected === 1 ? "item changes" : "items change"}
            {preview.skipped > 0 ? `, ${preview.skipped} skipped (no fixed price, or in a flash sale)` : ""}. Nothing is saved until you confirm.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Item</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{kes(r.before.price)}{r.before.priceMax !== null ? ` to ${kes(r.before.priceMax)}` : ""}</td>
                    <td data-testid={`after-${r.id}`}>{kes(r.after.price)}{r.after.priceMax !== null ? ` to ${kes(r.after.priceMax)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 50 && <p className={styles.hint}>Showing the first 50 of {preview.rows.length}. All will change.</p>}
        </div>
      )}
    </Modal>
  );
}

function PickDialog({ open, title, labelId, onClose, onApply, children, ready }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await onApply();
    } catch (e) {
      setError(e.message || "Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      labelId={labelId}
      footer={
        <>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primary} onClick={go} disabled={!ready || busy}>Apply</button>
        </>
      }
    >
      {children}
      {error && <p className={styles.err} role="alert">{error}</p>}
    </Modal>
  );
}

export function SectionDialog({ open, sections, onClose, onApply }) {
  const [value, setValue] = useState("");
  return (
    <PickDialog open={open} title="Move to section" labelId="section-title" onClose={onClose} onApply={() => onApply(value.trim())} ready={value.trim().length <= 60}>
      <label className={styles.stack}>
        <span>Section name (leave empty to remove the section)</span>
        <input className={styles.text} list="section-options" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Section name" maxLength={60} />
        <datalist id="section-options">{sections.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
    </PickDialog>
  );
}

export function AvailabilityDialog({ open, onClose, onApply }) {
  const [value, setValue] = useState("available");
  return (
    <PickDialog open={open} title="Set availability" labelId="avail-title" onClose={onClose} onApply={() => onApply(value)} ready>
      <label className={styles.stack}>
        <span>Availability</span>
        <select className={styles.select} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Availability">
          {DB_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
    </PickDialog>
  );
}

export function TypeDialog({ open, count, untyped, onClose, onApply }) {
  const { types, loading, error } = useProductTypes();
  const [value, setValue] = useState("");
  const sorted = useMemo(() => [...types].sort((a, b) => String(a.name).localeCompare(String(b.name))), [types]);
  return (
    <PickDialog open={open} title="Set product type" labelId="type-title" onClose={onClose} onApply={() => onApply(value)} ready={Boolean(value) && untyped > 0}>
      <p>
        {untyped === 0
          ? "Every selected item already has a type, so nothing would change."
          : `${untyped} of the ${count} selected ${untyped === 1 ? "item has" : "items have"} no type. Only ${untyped === 1 ? "that one changes" : "those change"}. Prices and stock stay as they are, and items missing details for the new type are listed under "items to finish".`}
      </p>
      {error ? <p role="alert">We could not load the types. Close this and try again.</p> : (
        <label className={styles.stack}>
          <span>Product type</span>
          <select className={styles.select} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Product type" disabled={loading}>
            <option value="">{loading ? "Loading" : "Choose a type"}</option>
            {sorted.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
    </PickDialog>
  );
}

export default function BulkBar({ count, total, allSelected, busy, onSelectAll, onClear, onAction }) {
  return (
    <div className={styles.bulk} role="region" aria-label="Bulk actions" data-testid="bulk-bar">
      <span className={styles.bulkCount}>{count} selected</span>
      <button type="button" className={styles.ghost} onClick={allSelected ? onClear : onSelectAll}>{allSelected ? "Clear selection" : `Select all ${total}`}</button>
      <span className={styles.bulkActions}>
        <button type="button" className={styles.mini} disabled={busy} onClick={() => onAction("hide")}>Hide</button>
        <button type="button" className={styles.mini} disabled={busy} onClick={() => onAction("show")}>Show</button>
        <button type="button" className={styles.mini} disabled={busy} onClick={() => onAction("section")}>Move to section</button>
        <button type="button" className={styles.mini} disabled={busy} onClick={() => onAction("availability")}>Set availability</button>
        <button type="button" className={styles.mini} disabled={busy} onClick={() => onAction("type")}>Set type</button>
        <button type="button" className={styles.mini} disabled={busy} onClick={() => onAction("prices")}>Change prices</button>
        <button type="button" className={styles.mini} disabled={busy} onClick={() => onAction("confirm")}>Confirm prices</button>
        <button type="button" className={`${styles.mini} ${styles.dangerBtn}`} disabled={busy} onClick={() => onAction("delete")}>Delete</button>
      </span>
    </div>
  );
}

export { priceText };
