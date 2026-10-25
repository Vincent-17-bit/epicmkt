import { Children, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import styles from "./Carousel.module.css";

const EDGE_SLACK = 2;
const DRAG_THRESHOLD = 5;

/**
 * The one horizontal section used on the home page: a title, a "See more" link and left and right arrows above a
 * row that scrolls by swipe, mouse drag, keyboard or the arrows. `variant` picks how many cards fit across
 * ("tile" for small store tiles, "showcase" for the larger featured cards); the card width comes from that, so the
 * row looks the same on a phone, a tablet and a wide screen, with a peek of the next card to show there is more.
 */
export default function Carousel({
  id,
  title,
  subtitle,
  seeMoreTo,
  seeMoreLabel = "See more",
  prevLabel = "Show previous",
  nextLabel = "Show next",
  variant = "tile",
  busy = false,
  children
}) {
  const trackRef = useRef(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 });
  const [edge, setEdge] = useState({ start: true, end: true });
  const [dragging, setDragging] = useState(false);
  const count = Children.count(children);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setEdge({ start: track.scrollLeft <= EDGE_SLACK, end: track.scrollLeft >= max - EDGE_SLACK });
  }, []);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [measure, count]);

  const page = (dir) => () => {
    const track = trackRef.current;
    const first = track?.firstElementChild;
    if (!track || !first) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = first.getBoundingClientRect().width + gap;
    const whole = Math.max(1, Math.floor((track.clientWidth + gap) / step));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: dir * whole * step, behavior: reduce ? "auto" : "smooth" });
  };

  const onPointerDown = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { active: true, moved: false, startX: event.clientX, startLeft: trackRef.current.scrollLeft };
  };

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state.active) return;
    const delta = event.clientX - state.startX;
    if (!state.moved && Math.abs(delta) > DRAG_THRESHOLD) {
      state.moved = true;
      setDragging(true);
    }
    if (state.moved) trackRef.current.scrollLeft = state.startLeft - delta;
  };

  const endDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
  };

  // A drag that ends over a card must not also open it.
  const onClickCapture = (event) => {
    if (!drag.current.moved) return;
    drag.current.moved = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const titleId = `${id}-title`;

  return (
    <div className={styles.wrap} data-variant={variant} role="region" aria-roledescription="carousel" aria-labelledby={titleId}>
      <div className={styles.head}>
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {subtitle && <p className={styles.sub}>{subtitle}</p>}
        </div>
        <div className={styles.controls}>
          {seeMoreTo && (
            <Link to={seeMoreTo} className={styles.seeMore}>
              {seeMoreLabel}
              <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
            </Link>
          )}
          <div className={styles.arrows}>
            <button type="button" className={styles.arrow} onClick={page(-1)} disabled={edge.start} aria-label={prevLabel}>
              <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
            </button>
            <button type="button" className={styles.arrow} onClick={page(1)} disabled={edge.end} aria-label={nextLabel}>
              <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <ul
        ref={trackRef}
        className={`${styles.track} ${dragging ? styles.dragging : ""}`}
        data-start={edge.start}
        data-end={edge.end}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        aria-busy={busy}
        aria-labelledby={titleId}
      >
        {Children.map(children, (child, index) => (
          <li key={child?.key ?? index} className={styles.slide}>
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
