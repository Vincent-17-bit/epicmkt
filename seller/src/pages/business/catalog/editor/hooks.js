import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

// ---- Breakpoint -----------------------------------------------------------------------------------------------------
// phone 320-767 (a stepper), tablet 768-1099 (tabs, all sections), desktop 1100-1599 (nav + live preview), wide 1600+.
// rem, not px, so a seller who raises their browser text size gets the roomier layout sooner.
const PHONE = "(max-width: 47.99rem)";
const WIDE = "(min-width: 100rem)";
const DESKTOP = "(min-width: 68.75rem)";

const readBreakpoint = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "tablet";
  const on = (q) => window.matchMedia(q).matches;
  if (on(PHONE)) return "phone";
  if (on(WIDE)) return "wide";
  return on(DESKTOP) ? "desktop" : "tablet";
};

export const useBreakpoint = () => {
  const [bp, setBp] = useState(readBreakpoint);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const lists = [PHONE, WIDE, DESKTOP].map((q) => window.matchMedia(q));
    const on = () => setBp(readBreakpoint());
    on();
    lists.forEach((l) => l.addEventListener?.("change", on));
    return () => lists.forEach((l) => l.removeEventListener?.("change", on));
  }, []);
  return bp;
};

export const prefersCalm = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Leaving with unsaved changes -----------------------------------------------------------------------------------
// Two doors: a route change inside the app (blocked, the editor asks), and closing or reloading the tab (the browser asks).
// `allow()` opens the first door for exactly one move, for a save that is about to navigate away.
export const useUnsavedGuard = (dirty) => {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const allowed = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowed.current) {
      allowed.current = false;
      return false;
    }
    return dirtyRef.current && currentLocation.pathname !== nextLocation.pathname;
  });
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const allow = useCallback(() => { allowed.current = true; }, []);
  return { blocker, allow };
};

// ---- A textarea that grows with what is typed -----------------------------------------------------------------------
export const useAutosize = (value) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
};

// ---- Dragging a row to a new place ----------------------------------------------------------------------------------
// Mouse only, and only a bonus: the Move buttons do the same for touch and keyboard.
export const useDragReorder = (onMove) => {
  const from = useRef(null);
  const [over, setOver] = useState(null);
  return {
    over,
    handleProps: (i) => ({
      draggable: true,
      onDragStart: (e) => {
        from.current = i;
        e.dataTransfer?.setData("text/plain", String(i));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => { from.current = null; setOver(null); },
    }),
    rowProps: (i) => ({
      onDragOver: (e) => {
        if (from.current === null) return;
        e.preventDefault();
        setOver(i);
      },
      onDrop: (e) => {
        if (from.current === null) return;
        e.preventDefault();
        const start = from.current;
        from.current = null;
        setOver(null);
        if (start !== i) onMove(start, i);
      },
    }),
  };
};

// ---- Draft autosave -------------------------------------------------------------------------------------------------
// The form (never the files) is kept on this device while it is being edited, so a closed tab or a dead battery costs nothing.
// A draft only comes back if the item it was made from has not changed since (`base` is that starting form).
const keyOf = (id) => `seller.itemDraft.v1:${id ?? "new"}`;

export const loadDraft = (id, base) => {
  try {
    const raw = localStorage.getItem(keyOf(id));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft && draft.base === base && draft.form && typeof draft.form === "object" ? draft : null;
  } catch {
    return null;
  }
};

export const storeDraft = (id, base, form) => {
  try { localStorage.setItem(keyOf(id), JSON.stringify({ base, form, savedAt: Date.now() })); } catch { /* storage full or blocked: the form still works, it just is not kept */ }
};

export const clearDraft = (id) => {
  try { localStorage.removeItem(keyOf(id)); } catch { /* nothing to clear */ }
};
