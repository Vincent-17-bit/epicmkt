import { useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// While mounted/active: wraps Tab inside the container and returns focus to whatever had it before.
export function useFocusTrap(ref, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    const onKeyDown = (event) => {
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node?.addEventListener("keydown", onKeyDown);
    return () => {
      node?.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function" && document.contains(previous)) previous.focus();
    };
  }, [ref, active]);
}
