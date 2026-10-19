import { useEffect, useRef } from "react";
import styles from "./BottomSheet.module.css";

export default function BottomSheet({ open, onClose, labelledBy, closeAbove, className = "", children }) {
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
    if (!open || !closeAbove) return undefined;
    const query = window.matchMedia(closeAbove);
    const onChange = () => query.matches && onClose();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open, onClose, closeAbove]);

  return (
    <dialog
      ref={ref}
      className={[styles.sheet, className].filter(Boolean).join(" ")}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {children}
    </dialog>
  );
}
