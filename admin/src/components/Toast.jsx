import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faCircleInfo, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "./IconButton.jsx";
import { cx } from "./cx.js";
import styles from "./Toast.module.css";

const ICONS = { success: faCircleCheck, info: faCircleInfo, warning: faTriangleExclamation, danger: faCircleExclamation };
const MAX_VISIBLE = 4;
export const DEFAULT_DURATION = 6000;
export const UNDO_DURATION = 8000;

const ToastContext = createContext(null);

/**
 * Wrap the app once. `useToast()` then gives:
 *   toast.show({ message, title?, tone?, duration?, action?, theme? })  -> id
 *   toast.success(message, opts) / info / warning / error
 *   toast.undo({ message, onUndo, onCommit?, duration? })       -> id
 *   toast.dismiss(id)
 * Errors stay until dismissed. Timers pause while the pointer is over a toast or focus is inside it,
 * so nobody loses Undo mid-click.
 */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(0);
  // Called when a toast ends without Undo being used (timeout or dismissed), for deferred commits.
  const commits = useRef(new Map());

  const remove = useCallback((id, reason) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const commit = commits.current.get(id);
    commits.current.delete(id);
    if (commit && reason !== "action") commit();
  }, []);

  const show = useCallback((input) => {
    const id = ++nextId.current;
    const tone = input.tone ?? "info";
    const duration = input.duration ?? (tone === "danger" ? 0 : input.action ? UNDO_DURATION : DEFAULT_DURATION);
    if (input.onCommit) commits.current.set(id, input.onCommit);
    setItems((list) => {
      const next = [...list, { id, tone, theme: input.theme, title: input.title, message: input.message, action: input.action, duration }];
      // Past the limit the oldest toast makes room. Its commit still runs.
      while (next.length > MAX_VISIBLE) {
        const dropped = next.shift();
        const commit = commits.current.get(dropped.id);
        commits.current.delete(dropped.id);
        if (commit) queueMicrotask(commit);
      }
      return next;
    });
    return id;
  }, []);

  const api = useMemo(
    () => ({
      show,
      dismiss: (id) => remove(id, "dismiss"),
      success: (message, opts) => show({ ...opts, message, tone: "success" }),
      info: (message, opts) => show({ ...opts, message, tone: "info" }),
      warning: (message, opts) => show({ ...opts, message, tone: "warning" }),
      error: (message, opts) => show({ ...opts, message, tone: "danger" }),
      undo: ({ message, onUndo, onCommit, duration = UNDO_DURATION, label = "Undo", theme }) =>
        show({ message, tone: "success", duration, onCommit, theme, action: { label, onAction: onUndo } }),
    }),
    [show, remove],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div data-toast-region="" className={styles.region}>
              {items.map((t) => (
                <ToastItem key={t.id} toast={t} onDone={remove} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}

function ToastItem({ toast, onDone }) {
  const { id, tone, theme, title, message, action, duration } = toast;
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef(0);
  const holds = useRef(0); // pointer and focus can both hold the timer

  const stop = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = 0;
    remaining.current -= Date.now() - startedAt.current;
  }, []);

  const start = useCallback(() => {
    if (!duration || timer.current || holds.current > 0) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => {
      timer.current = 0;
      onDone(id, "timeout");
    }, Math.max(0, remaining.current));
  }, [duration, id, onDone]);

  useEffect(() => {
    start();
    return () => {
      clearTimeout(timer.current);
      timer.current = 0;
    };
  }, [start]);

  const hold = () => {
    holds.current += 1;
    stop();
  };
  const release = () => {
    holds.current = Math.max(0, holds.current - 1);
    start();
  };

  const urgent = tone === "danger";
  return (
    <div
      className={cx(styles.toast, styles[tone])}
      data-theme={theme}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="true"
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      <span className={styles.icon} aria-hidden="true">
        <FontAwesomeIcon icon={ICONS[tone] ?? ICONS.info} />
      </span>
      <div className={styles.text}>
        {title ? <p className={styles.title}>{title}</p> : null}
        <p className={styles.message}>{message}</p>
      </div>
      {action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            action.onAction?.();
            onDone(id, "action");
          }}
        >
          {action.label}
        </button>
      ) : null}
      <IconButton
        variant="inverse"
        size="sm"
        aria-label="Dismiss notification"
        icon={<FontAwesomeIcon icon={faXmark} />}
        onClick={() => onDone(id, "dismiss")}
      />
    </div>
  );
}
