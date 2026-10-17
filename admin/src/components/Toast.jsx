import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";

const ToastContext = createContext(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast needs a ToastProvider");
  return value;
}

function ToastItem({ item, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div className={`toast toast--${item.tone}`} role={item.tone === "error" ? "alert" : undefined}>
      {item.tone === "error" ? <FontAwesomeIcon icon={faTriangleExclamation} className="admin-icon" /> : null}
      <span className="toast__message">{item.message}</span>
      {item.actionLabel ? (
        <button
          type="button"
          className="toast__button toast__action"
          onClick={() => {
            onDismiss(item.id);
            item.onAction?.();
          }}
        >
          {item.actionLabel}
        </button>
      ) : null}
      <button type="button" className="toast__button" aria-label="Dismiss" onClick={() => onDismiss(item.id)}>
        <FontAwesomeIcon icon={faXmark} className="admin-icon" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => setItems((current) => current.filter((item) => item.id !== id)), []);

  const push = useCallback(({ message, tone = "default", actionLabel, onAction, duration = 10000 }) => {
    counter.current += 1;
    const id = counter.current;
    setItems((current) => [...current, { id, message, tone, actionLabel, onAction, duration }]);
    return id;
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => <ToastItem key={item.id} item={item} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}
