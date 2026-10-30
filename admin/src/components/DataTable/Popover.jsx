import { useEffect, useRef, useState } from "react";
import Button from "../Button.jsx";

export default function Popover({ label, icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="dt__pop" ref={ref}>
      <Button size="sm" icon={icon} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        {label}
      </Button>
      {open ? <div className="dt__panel">{children}</div> : null}
    </div>
  );
}
