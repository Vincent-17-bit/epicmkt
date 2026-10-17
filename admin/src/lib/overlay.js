import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// Overlays register here so only the top-most one reacts to Esc and Tab.
const stack = [];
let locks = 0;

export function lockScroll() {
  locks += 1;
  if (locks === 1) document.documentElement.classList.add("is-scroll-locked");
  return () => {
    locks -= 1;
    if (locks === 0) document.documentElement.classList.remove("is-scroll-locked");
  };
}

export function focusables(node) {
  return [...node.querySelectorAll(FOCUSABLE)].filter((item) => item.getClientRects().length > 0);
}

/**
 * Modal behaviour shared by the modal, sheets and the mobile drawer:
 * scroll lock, focus moves in, Tab is trapped, Esc closes the top-most
 * overlay, and focus returns to whatever opened it.
 */
export function useOverlay(ref, { active = true, onClose, initialFocus } = {}) {
  const closeRef = useRef(onClose);
  const focusRef = useRef(initialFocus);
  closeRef.current = onClose;
  focusRef.current = initialFocus;

  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;

    const token = {};
    stack.push(token);
    const previous = document.activeElement;
    const unlock = lockScroll();

    const first = focusRef.current?.(node) ?? focusables(node)[0] ?? node;
    first.focus({ preventScroll: true });

    const onKey = (event) => {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(node);
      if (!items.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (!node.contains(document.activeElement)) {
        event.preventDefault();
        head.focus();
      } else if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      unlock();
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
