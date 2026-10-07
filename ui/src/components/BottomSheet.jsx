import { useEffect, useRef } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import IconButton from "./IconButton.jsx";
import styles from "./BottomSheet.module.css";

export default function BottomSheet({ open, onClose, title, titleId = "bottom-sheet-title", closeLabel = "Close", footer, children }) {
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

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <IconButton icon={faXmark} label={closeLabel} onClick={onClose} />
          </div>
          <div className={styles.body}>{children}</div>
          <div className={styles.foot}>{footer}</div>
        </div>
      )}
    </dialog>
  );
}
