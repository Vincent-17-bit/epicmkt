import { useEffect, useRef } from "react";
import styles from "./catalog.module.css";

export default function Modal({ open, onClose, title, children, footer, wide = false, sheet = false, labelId }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    return undefined;
  }, [open]);
  const id = labelId ?? "modal-title";
  return (
    <dialog
      ref={ref}
      className={`${styles.modal} ${wide ? styles.modalWide : ""} ${sheet ? styles.sheet : ""}`}
      aria-labelledby={id}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className={styles.modalInner}>
          <header className={styles.modalHead}>
            <h2 id={id}>{title}</h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">Close</button>
          </header>
          <div className={styles.modalBody}>{children}</div>
          {footer && <footer className={styles.modalFoot}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
