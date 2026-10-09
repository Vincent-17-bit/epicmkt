import styles from "./Toaster.module.css";

export default function Toaster({ toasts, onDismiss, dismissLabel = "Dismiss" }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast}>
          <span>{toast.message}</span>
          <button type="button" className={styles.close} onClick={() => onDismiss(toast.id)}>
            {dismissLabel}
          </button>
        </div>
      ))}
    </div>
  );
}
