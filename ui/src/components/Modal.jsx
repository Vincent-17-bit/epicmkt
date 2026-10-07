import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";

export default function Modal({ open, onClose, className = "", children, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${className}`}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose?.()}
      {...rest}
    >
      {children}
    </dialog>
  );
}
