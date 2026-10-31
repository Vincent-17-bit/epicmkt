import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keeps keyboard focus inside `ref` while `active`: moves focus in on open, wraps Tab and Shift+Tab, closes on
// Escape, and puts focus back where it was (or on `returnTo`) on close. Shared by dialogs and the mobile More sheet.
export function useFocusTrap(ref, active, { onEscape, returnTo } = {}) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const returnRef = useRef(returnTo);
  returnRef.current = returnTo;

  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;
    const previous = document.activeElement;
    node.querySelector(FOCUSABLE)?.focus();

    const onKey = (event) => {
      if (event.key === "Escape" && escapeRef.current) {
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const outside = !node.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      const target = returnRef.current?.current ?? previous;
      target?.focus?.({ preventScroll: true });
    };
  }, [ref, active]);
}
