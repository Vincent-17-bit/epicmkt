import { useEffect, useRef } from "react";
import Button from "../../components/Button.jsx";
import styles from "./leave.module.css";

export default function LeaveDialog({ open, onStay, onLeave }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} role="alertdialog" aria-labelledby="leave-title" onCancel={onStay}>
      <h2 id="leave-title">Leave this page?</h2>
      <p>Your draft is saved on this device, so you can continue later.</p>
      <div className={styles.row}>
        <Button onClick={onStay}>Stay</Button>
        <Button variant="secondary" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </dialog>
  );
}
