import { useEffect, useId, useRef, useState } from "react";
import ui from "../styles/ui.module.css";

export default function Intro({ children }) {
  const id = useId();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return undefined;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, children]);

  return (
    <div className={ui.intro}>
      <p ref={ref} id={id} className={ui.introText} data-open={open}>{children}</p>
      {(clipped || open) && (
        <button type="button" className={ui.introMore} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
