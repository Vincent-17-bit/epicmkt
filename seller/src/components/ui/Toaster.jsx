import { useEffect, useRef } from "react";
import { useToastStore } from "../../stores/toast.js";
import styles from "./Toaster.module.css";

const supportsPopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    try {
      if (toasts.length && !el.matches(":popover-open")) el.showPopover();
      if (!toasts.length && el.matches(":popover-open")) el.hidePopover();
    } catch {
      return;
    }
  }, [toasts.length]);

  return (
    <div ref={ref} popover={supportsPopover ? "manual" : undefined} className={styles.region} role="region" aria-label="Notifications">
      <div aria-live="polite" className={styles.list}>
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast} data-tone={t.tone}>
            <span className={styles.message}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  dismiss(t.id);
                  t.action.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
