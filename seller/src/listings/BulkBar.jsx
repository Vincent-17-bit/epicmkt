import styles from "./listings.module.css";

export default function BulkBar({ count, resultCount, onSelectAll, onClear, onAction, busy }) {
  if (count === 0) return null;
  const act = (name) => () => onAction(name);
  return (
    <div className={styles.bulk} role="region" aria-label="Bulk actions">
      <p className={styles.bulkCount} role="status">{count} selected</p>
      {count < resultCount && <button type="button" className={styles.linkBtn} onClick={onSelectAll}>Select all {resultCount}</button>}
      <button type="button" className={styles.linkBtn} onClick={onClear}>Clear</button>
      <div className={styles.bulkActions}>
        <button type="button" className={styles.secondaryBtn} onClick={act("hide")} disabled={busy}>Hide</button>
        <button type="button" className={styles.secondaryBtn} onClick={act("show")} disabled={busy}>Show</button>
        <button type="button" className={styles.secondaryBtn} onClick={act("move_section")} disabled={busy}>Move to section</button>
        <button type="button" className={styles.secondaryBtn} onClick={act("set_availability")} disabled={busy}>Set availability</button>
        <button type="button" className={styles.secondaryBtn} onClick={act("price_percent")} disabled={busy}>Change prices</button>
        <button type="button" className={styles.secondaryBtn} onClick={act("confirm_prices")} disabled={busy}>Confirm prices</button>
        <button type="button" className={styles.dangerBtn} onClick={act("delete")} disabled={busy}>Delete</button>
      </div>
    </div>
  );
}
