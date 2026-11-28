import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faHeart, faHeartCrack, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./Toaster.module.css";

/**
 * The site's toasts: a small card with a status icon (a green tick, or a red mark for a problem), the message, an optional action
 * as a button (Undo, View list) and a close mark. toast = { id, message, tone?: "success" | "error", action?: { label, onClick } }.
 * With no tone a toast reads as success, so a toast pushed the old way (message only) looks like "Item added".
 * Richer toasts (the wishlist): icon "heart" | "heart-off" draws a heart, image adds the product's picture with a small heart on it,
 * and detail is a second line (the product's name) under the message.
 */
export default function Toaster({ toasts, onDismiss, dismissLabel = "Dismiss" }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((toast) => {
        const error = toast.tone === "error";
        const heart = toast.icon === "heart" || toast.icon === "heart-off";
        const glyph = toast.icon === "heart" ? faHeart : toast.icon === "heart-off" ? faHeartCrack : error ? faCircleExclamation : faCircleCheck;
        return (
          <div key={toast.id} className={`${styles.toast} ${error ? styles.error : ""} ${heart ? styles.love : ""}`} data-tone={error ? "error" : "success"} data-icon={toast.icon || undefined}>
            {toast.image ? (
              <span className={styles.thumb}>
                <img src={toast.image} alt="" className={styles.thumbImg} />
                {heart && <FontAwesomeIcon icon={glyph} className={styles.badge} aria-hidden="true" />}
              </span>
            ) : heart ? (
              <span className={styles.heartDisc}>
                <FontAwesomeIcon icon={glyph} aria-hidden="true" />
              </span>
            ) : (
              <FontAwesomeIcon icon={glyph} className={styles.icon} aria-hidden="true" />
            )}
            <span className={styles.text}>
              <span className={styles.message}>{toast.message}</span>
              {toast.detail && <span className={styles.detail}>{toast.detail}</span>}
            </span>
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
