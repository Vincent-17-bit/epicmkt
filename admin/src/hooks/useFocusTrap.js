import { useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside a modal, focuses `initialRef` (or the first control) on open, and restores focus on close. */
export function useFocusTrap(active, containerRef, initialRef) {
  useEffect(() => {
    if (!active || !containerRef.current) return undefined;
    const node = containerRef.current;
    const previous = document.activeElement;
    (initialRef?.current ?? node.querySelector(FOCUSABLE))?.focus();
    const onKey = (event) => {
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, [active, containerRef, initialRef]);
}
