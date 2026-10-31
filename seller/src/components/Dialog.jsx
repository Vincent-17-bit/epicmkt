import { useId } from "react";
import { Modal } from "@epicmkt/ui";
import styles from "./dialog.module.css";

// A titled dialog with a Close link. Its content only mounts while it is open, so forms start fresh each time.
export default function Dialog({ open, onClose, title, children }) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} labelledBy={id}>
      <div className={styles.dialog}>
        <div className={styles.head}>
          <h2 id={id}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose}>Close</button>
        </div>
        {open && children}
      </div>
    </Modal>
  );
}
