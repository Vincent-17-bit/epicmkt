import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./Toaster.module.css";

/**
 * The site's toasts: a small card with a status icon (a green tick, or a red mark for a problem), the message, an optional action
 * as a button (Undo, View list) and a close mark. toast = { id, message, tone?: "success" | "error", action?: { label, onClick } }.
 * With no tone a toast reads as success, so a toast pushed the old way (message only) looks like "Item added".
 */
export default function Toaster({ toasts, onDismiss, dismissLabel = "Dismiss" }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((toast) => {
        const error = toast.tone === "error";
        return (
          <div key={toast.id} className={`${styles.toast} ${error ? styles.error : ""}`} data-tone={error ? "error" : "success"}>
            <FontAwesomeIcon icon={error ? faCircleExclamation : faCircleCheck} className={styles.icon} aria-hidden="true" />
            <span className={styles.message}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  toast.action.onClick?.();
                  onDismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className={styles.close} aria-label={dismissLabel} title={dismissLabel} onClick={() => onDismiss(toast.id)}>
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
