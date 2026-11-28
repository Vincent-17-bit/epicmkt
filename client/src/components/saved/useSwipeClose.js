import { useEffect } from "react";
import { prefersReducedMotion } from "../../lib/motion.js";

const START = 10; // px of movement before we decide whether this is a swipe or a scroll
const FAR = 0.3; // of the panel's width
const FAST = 0.5; // px per ms

/**
 * Swipe the Saved panel to the right to close it. Touch and pen only, never a mouse.
 * After 10 px of movement the direction is decided: mostly sideways and to the right is a drag (the panel follows the finger and the backdrop
 * fades with it); anything else is left to the list to scroll. On release it closes past 30% of the width or faster than 0.5 px/ms, else it
 * springs back in 200 ms. Gestures that start on an input, the stepper, or anything marked data-no-swipe are ignored. With reduced motion
 * nothing follows the finger: a swipe that qualifies simply closes.
 */
export function useSwipeClose({ panelRef, backdropRef, onClose, active = true }) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !active) return undefined;
    let g = null;

    const reset = (animate) => {
      if (animate && !prefersReducedMotion()) panel.style.transition = "transform 200ms ease-out";
      panel.style.transform = "";
      if (backdropRef?.current) {
        backdropRef.current.style.transition = animate ? "opacity 200ms ease-out" : "";
        backdropRef.current.style.opacity = "";
      }
      if (animate) window.setTimeout(() => { panel.style.transition = ""; if (backdropRef?.current) backdropRef.current.style.transition = ""; }, 220);
    };

    const down = (e) => {
      if (e.pointerType === "mouse") return;
      if (e.target?.closest?.("input, textarea, select, [data-no-swipe]")) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), mode: null, dx: 0 };
    };
    const move = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.mode) {
        if (Math.hypot(dx, dy) < START) return;
        g.mode = Math.abs(dx) > Math.abs(dy) && dx > 0 ? "drag" : "scroll";
        if (g.mode === "drag") {
          try { panel.setPointerCapture?.(e.pointerId); } catch { /* the browser decides */ }
        }
      }
      if (g.mode !== "drag") return;
      g.dx = Math.max(0, dx);
      if (prefersReducedMotion()) return;
      panel.style.transition = "";
      panel.style.transform = `translateX(${g.dx}px)`;
      if (backdropRef?.current) backdropRef.current.style.opacity = String(Math.max(0, 1 - g.dx / (panel.offsetWidth || 1)));
    };
    const up = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const done = g;
      g = null;
      if (done.mode !== "drag") return;
      const width = panel.offsetWidth || 1;
      const elapsed = Math.max(1, performance.now() - done.at);
      const dx = Math.max(done.dx, e.clientX - done.x);
      if (dx > width * FAR || dx / elapsed > FAST) onClose();
      else reset(true);
    };
    const cancel = () => {
      if (g?.mode === "drag") reset(true);
      g = null;
    };

    panel.addEventListener("pointerdown", down);
    panel.addEventListener("pointermove", move);
    panel.addEventListener("pointerup", up);
    panel.addEventListener("pointercancel", cancel);
    return () => {
      panel.removeEventListener("pointerdown", down);
      panel.removeEventListener("pointermove", move);
      panel.removeEventListener("pointerup", up);
      panel.removeEventListener("pointercancel", cancel);
    };
  }, [panelRef, backdropRef, onClose, active]);
}
