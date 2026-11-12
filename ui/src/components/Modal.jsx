import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";

// Page scroll lock shared by every open modal (a counter, so two open at once do not unlock each other early).
let locks = 0;
let saved = null;
function lockScroll() {
  if (typeof document === "undefined") return () => {};
  if (locks === 0) {
    const { body, documentElement } = document;
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    // Keep the page from jumping sideways when the scrollbar disappears.
    const bar = Math.max(0, (window.innerWidth || 0) - documentElement.clientWidth);
    if (bar > 0) body.style.paddingRight = `${bar}px`;
    body.style.overflow = "hidden";
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0 && saved) {
      document.body.style.overflow = saved.overflow;
      document.body.style.paddingRight = saved.paddingRight;
      saved = null;
    }
  };
}

// A native <dialog> opened with showModal(): the browser traps focus, the page behind is inert and the backdrop is the translucent --scrim.
//   open, onClose, labelledBy, className   as before
//   variant       "card" (default, a centred card) or "sheet" (a bottom sheet on a narrow screen, a centred card from 40rem)
//   lockScroll    the page behind does not scroll while open (default true)
//   restoreFocus  focus goes back to what opened it when it closes (default true; browsers do this too, jsdom does not)
// Clicking the backdrop, pressing Escape or closing from inside all end in onClose().
export default function Modal({ open, onClose, labelledBy, className = "", variant = "card", lockScroll: lock = true, restoreFocus = true, children }) {
  const ref = useRef(null);
  const opener = useRef(null);
  const wasOpen = useRef(false);

  // Remember what had focus at the moment of opening. This happens while rendering, before the children mount, so a child with
  // autoFocus cannot replace it.
  if (open && !wasOpen.current && typeof document !== "undefined") opener.current = document.activeElement;
  wasOpen.current = open;

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || !lock) return undefined;
    return lockScroll();
  }, [open, lock]);

  // Return focus to the opener once closed (also when the parent just flips `open`).
  useEffect(() => {
    if (open || !restoreFocus) return;
    const node = opener.current;
    opener.current = null;
    if (node && typeof node.focus === "function" && node.isConnected) node.focus();
  }, [open, restoreFocus]);

  const cls = [styles.dialog, variant === "sheet" ? styles.sheet : "", className].filter(Boolean).join(" ");
  return (
    <dialog
      ref={ref}
      className={cls}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
    >
      {children}
    </dialog>
  );
}
