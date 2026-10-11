import { useId } from "react";
import { Modal } from "@epicmkt/ui";
import styles from "./listings.module.css";

export default function Dialog({ open, onClose, title, children, wide }) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} labelledBy={id}>
      <div className={styles.dialog} data-wide={wide ? "true" : undefined}>
        <div className={styles.dialogHead}>
          <h2 id={id}>{title}</h2>
          <button type="button" className={styles.linkBtn} onClick={onClose}>Close</button>
        </div>
        {open && children}
      </div>
    </Modal>
  );
}
