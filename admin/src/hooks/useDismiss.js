import { useEffect } from "react";

/** Closes a popover on Escape or a press outside it, and puts focus back on the button that opened it. */
export function useDismiss(open, onClose, containerRef, returnFocusRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        onClose();
        returnFocusRef?.current?.focus();
      }
    };
    const onPress = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open, onClose, containerRef, returnFocusRef]);
}
