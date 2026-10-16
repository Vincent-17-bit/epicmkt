import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cx } from "../cx.js";
import { useDismiss } from "../../hooks/useDismiss.js";
import styles from "./DataTable.module.css";

/**
 * A button that opens a small panel (a menu, a list of options, a form). Escape or a press outside closes it and puts
 * focus back on the button. `children` may be a function that receives { close }.
 * `label` is the accessible name for both the button (if it has no visible text) and the panel.
 */
export function Popover({ label, icon, text, children, align = "end", className, panelClassName, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const set = useCallback((next) => { setOpen(next); onOpenChange?.(next); }, [onOpenChange]);
  const close = useCallback(() => set(false), [set]);
  useDismiss(open, close, rootRef, buttonRef);

  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector("[data-autofocus], input, button:not([disabled])");
    first?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div ref={rootRef} className={cx(styles.popover, className)}>
      <button ref={buttonRef} type="button" className={styles.toolButton} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        aria-label={label} title={label} onClick={() => set(!open)}>
        <span className={styles.toolIcon} aria-hidden="true">{icon}</span>
        {text ? <span className={styles.toolText}>{text}</span> : null}
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} role="dialog" aria-label={label} className={cx(styles.panel, align === "start" ? styles.panelStart : styles.panelEnd, panelClassName)}>
          {typeof children === "function" ? children({ close }) : children}
        </div>
      ) : null}
    </div>
  );
}
