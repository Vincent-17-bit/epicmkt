import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./catalog.module.css";

// "How many do you have now?" For an item whose stock is counted, a count of 0 would put it straight back out, so a
// real number is needed to list it again. Items that are not counted skip this and come back in one tap.
export default function RestockDialog({ open, item, onClose, onApply }) {
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setCount("");
      setError("");
    }
  }, [open, item?.id]);
  const valid = /^\d{1,6}$/.test(count.trim()) && Number(count) >= 1;
  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      await onApply(Number(count));
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
      title="Back in stock"
      labelId="restock-title"
      footer={
        <>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primary} onClick={apply} disabled={!valid || busy}>List it again</button>
        </>
      }
    >
      <form className={styles.stack} onSubmit={(e) => { e.preventDefault(); if (valid && !busy) apply(); }}>
        <label className={styles.stack}>
          <span>How many {item?.name ? `“${item.name}”` : "items"} do you have now?</span>
          <input
            className={styles.text}
            inputMode="numeric"
            autoFocus
            value={count}
            onChange={(e) => setCount(e.target.value)}
            aria-label="Stock count"
            maxLength={6}
          />
        </label>
        <p className={styles.hint}>Customers can see it again as soon as you save.</p>
      </form>
      {error && <p className={styles.err} role="alert">{error}</p>}
    </Modal>
  );
}
