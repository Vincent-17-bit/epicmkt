import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { BELOW_MD } from "../../lib/breakpoints.js";
import { useMediaQuery } from "../../lib/useMediaQuery.js";
import Button from "../Button.jsx";
import Sheet from "../Sheet.jsx";

const EDGE = 8;
const GAP = 6;

// Place the panel under the trigger, flip above when there is more room there,
// and shift sideways so it never leaves the viewport.
function place(trigger, panel) {
  const anchor = trigger.getBoundingClientRect();
  const width = Math.min(panel.offsetWidth, window.innerWidth - EDGE * 2);
  const natural = panel.scrollHeight;
  const below = window.innerHeight - anchor.bottom - GAP - EDGE;
  const above = anchor.top - GAP - EDGE;
  const flip = natural > below && above > below;
  const room = flip ? above : below;
  const height = Math.min(natural, room);
  const left = Math.min(Math.max(anchor.right - width, EDGE), window.innerWidth - width - EDGE);
  const top = flip ? anchor.top - GAP - height : anchor.bottom + GAP;
  return { top, left, maxHeight: Math.max(room, 0) };
}

export default function Popover({ label, icon, title = label, labelAlways = false, children }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const phone = useMediaQuery(BELOW_MD);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const content = typeof children === "function" ? children({ close }) : children;

  useLayoutEffect(() => {
    if (!open || phone) return undefined;
    const update = () => {
      if (triggerRef.current && panelRef.current) setPosition(place(triggerRef.current, panelRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = new ResizeObserver(update);
    observer.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer.disconnect();
      setPosition(null);
    };
  }, [open, phone]);

  useEffect(() => {
    if (!open || phone) return undefined;
    panelRef.current?.querySelector("input, button, select")?.focus({ preventScroll: true });

    const outside = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, phone]);

  return (
    <div className="dt__pop" ref={wrapRef}>
      <Button
        ref={triggerRef}
        icon={icon}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={labelAlways ? undefined : "dt__label"}>{label}</span>
      </Button>
      {open && !phone ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={title}
          className="dt__panel"
          style={position ? { top: position.top, left: position.left, maxHeight: position.maxHeight } : { visibility: "hidden" }}
        >
          {content}
        </div>
      ) : null}
      {open && phone ? (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <div className="sheet__body">{content}</div>
        </Sheet>
      ) : null}
    </div>
  );
}
