import { Children, useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import styles from "./HScroller.module.css";

const DRAG_THRESHOLD = 5;

export default function HScroller({ children, leftLabel, rightLabel, busy = false, cellWidth, className = "" }) {
  const rowRef = useRef(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 });
  const [edges, setEdges] = useState({ left: false, right: false });
  const [dragging, setDragging] = useState(false);
  const count = Children.count(children);

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    setEdges({ left: row.scrollLeft > 4, right: row.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, count]);

  const page = (dir) => () => {
    const row = rowRef.current;
    row?.scrollBy({ left: dir * row.clientWidth, behavior: "smooth" });
  };

  const onPointerDown = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { active: true, moved: false, startX: event.clientX, startLeft: rowRef.current.scrollLeft };
  };

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state.active) return;
    const delta = event.clientX - state.startX;
    if (!state.moved && Math.abs(delta) > DRAG_THRESHOLD) {
      state.moved = true;
      setDragging(true);
    }
    if (state.moved) rowRef.current.scrollLeft = state.startLeft - delta;
  };

  const endDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
  };

  const onClickCapture = (event) => {
    if (!drag.current.moved) return;
    drag.current.moved = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onKeyDown = (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const focusables = [...rowRef.current.querySelectorAll("[data-card], [data-tile]")];
    const index = focusables.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? focusables.length - 1 : index + (event.key === "ArrowRight" ? 1 : -1);
    const target = focusables[Math.min(focusables.length - 1, Math.max(0, next))];
    target.focus({ preventScroll: true });
    target.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  };

  return (
    <div className={`${styles.frame} ${className}`} style={cellWidth ? { "--cell": cellWidth } : undefined}>
      <ul
        ref={rowRef}
        className={`${styles.row} ${dragging ? styles.dragging : ""}`}
        data-left={edges.left}
        data-right={edges.right}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
        aria-busy={busy}
      >
        {Children.map(children, (child, index) => (
          <li key={child?.key ?? index} className={styles.cell} data-wide={child?.props?.["data-wide"] ? "true" : undefined}>
            {child}
          </li>
        ))}
      </ul>
      <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={page(-1)} disabled={!edges.left} aria-label={leftLabel} tabIndex={-1}>
        <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
      </button>
      <button type="button" className={`${styles.nav} ${styles.next}`} onClick={page(1)} disabled={!edges.right} aria-label={rightLabel} tabIndex={-1}>
        <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
      </button>
    </div>
  );
}
