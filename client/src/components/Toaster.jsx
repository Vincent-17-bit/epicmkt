import { useToastStore } from "../stores/toast.js";
import styles from "./Toaster.module.css";

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast}>
          <span>{toast.message}</span>
          <button type="button" className={styles.close} onClick={() => dismiss(toast.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
