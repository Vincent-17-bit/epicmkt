import { useEffect, useRef } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import Button from "./Button.jsx";
import IconButton from "./IconButton.jsx";
import styles from "./FilterSheet.module.css";

export default function FilterSheet({ open, onClose, total, onClear, canClear, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => query.matches && onClose();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby="filter-sheet-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 id="filter-sheet-title" className={styles.title}>
              Filters
            </h2>
            <IconButton icon={faXmark} label="Close filters" onClick={onClose} />
          </div>
          <div className={styles.body}>{children}</div>
          <div className={styles.foot}>
            {canClear && (
              <Button variant="ghost" onClick={onClear}>
                Clear all
              </Button>
            )}
            <Button variant="dark" className={styles.show} onClick={onClose}>
              {total == null ? "Show results" : `Show ${total} ${total === 1 ? "result" : "results"}`}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
