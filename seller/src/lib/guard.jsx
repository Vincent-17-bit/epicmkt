import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router-dom";

const GuardContext = createContext({ setDirty() {}, anyDirty: false });

export function ConfirmDialog({ title, body, confirm, cancel, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="sx-scrim" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="sx-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sx-confirm-title">
        <h2 id="sx-confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="sx-row sx-row--end">
          <button type="button" className="sx-btn" onClick={onCancel} autoFocus>{cancel}</button>
          <button type="button" className="sx-btn sx-btn--danger" onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </div>
  );
}

/** Tracks which cards have unsaved edits; blocks navigation and tab close while any do. */
export function GuardProvider({ children }) {
  const [dirty, setDirtyState] = useState(() => new Set());
  const setDirty = useCallback((id, flag) => {
    setDirtyState((prev) => {
      if (prev.has(id) === flag) return prev;
      const next = new Set(prev);
      if (flag) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const anyDirty = dirty.size > 0;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => anyDirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!anyDirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const value = useMemo(() => ({ setDirty, anyDirty }), [setDirty, anyDirty]);
  return (
    <GuardContext.Provider value={value}>
      {children}
      {blocker.state === "blocked" && (
        <ConfirmDialog
          title="Leave without saving?"
          body="You have changes that are not saved. If you leave now they will be lost."
          confirm="Leave without saving"
          cancel="Stay on this page"
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
    </GuardContext.Provider>
  );
}

export const useGuard = () => useContext(GuardContext);

/** Report a card's dirty state to the guard for as long as the card is mounted. */
export function useDirty(id, flag) {
  const { setDirty } = useGuard();
  useEffect(() => {
    setDirty(id, Boolean(flag));
    return () => setDirty(id, false);
  }, [id, flag, setDirty]);
}
