import { useEffect } from "react";

// Closes a popover when the person clicks outside it or presses Escape.
// Escape also returns focus to `returnFocusRef` (the control that opened it), so a keyboard user is not dropped
// at the top of the page.
export function useDismiss(ref, open, close, returnFocusRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        close();
        returnFocusRef?.current?.focus?.({ preventScroll: true });
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close, returnFocusRef]);
}
