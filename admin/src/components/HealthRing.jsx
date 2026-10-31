import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BANDS, describeHealth, readHealth, trendInfo } from "../lib/healthView.js";
import HealthCard from "./HealthCard.jsx";

const STROKE = 4;
const GAP = 8;
const CLOSE_DELAY = 140;

function Arc({ value, tone, size }) {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="health-ring__svg">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
      {value === null ? null : (
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={STROKE} strokeLinecap="round"
          className={`health-ring__arc health-ring__arc--${tone}`}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

/**
 * The health score as a ring, with its band label and a 7-day trend. Hover, focus or tap opens the breakdown (the four parts,
 * the weakest one, and the reasons). Pass the whole table row's `health` and `trend`; a bare `score` still draws a plain ring.
 * `interactive={false}` draws the ring only (the business page shows the breakdown next to it).
 */
export default function HealthRing({ health: given, score, trend = null, size = 44, showLabel = false, interactive = true }) {
  const health = given ?? readHealth({ healthScore: score });
  const value = health.score === null || health.score === undefined ? null : Math.max(0, Math.min(100, Math.round(health.score)));
  const band = BANDS[health.band] ?? BANDS.none;
  const rich = interactive && Boolean(health.subs) && value !== null;
  const t = trendInfo(trend);

  const id = useId();
  const button = useRef(null);
  const panel = useRef(null);
  const timer = useRef(0);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [at, setAt] = useState(null);
  const open = rich && (hover || pinned);

  const cancel = () => window.clearTimeout(timer.current);
  const enter = () => { cancel(); setHover(true); };
  const leave = () => { cancel(); timer.current = window.setTimeout(() => setHover(false), CLOSE_DELAY); };
  useEffect(() => cancel, []);

  const place = useCallback(() => {
    const anchor = button.current?.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    if (!anchor || !box) return;
    const width = box.width;
    const viewW = document.documentElement.clientWidth || window.innerWidth;   // without the scrollbar
    const viewH = document.documentElement.clientHeight || window.innerHeight;
    const left = Math.max(GAP, Math.min(anchor.left, viewW - width - GAP));
    const below = anchor.bottom + GAP;
    const top = below + box.height > window.innerHeight - GAP && anchor.top - GAP - box.height > GAP ? anchor.top - GAP - box.height : below;
    setAt({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setAt(null); return undefined; }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setHover(false);
      setPinned(false);
      button.current?.focus({ preventScroll: true });
    };
    const onPointer = (event) => {
      if (pinned && !button.current?.contains(event.target) && !panel.current?.contains(event.target)) setPinned(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, pinned]);

  const face = (
    <>
      <span className="health-ring" style={{ "--ring-size": `${size}px` }}>
        <Arc value={value} tone={band.tone} size={size} />
        <span className="health-ring__value">{value === null ? "–" : value}</span>
      </span>
      {showLabel ? (
        <span className="health-ring__text">
          <span className={`health-chip health-chip--${band.tone}`}>{health.label}</span>
          {t.dir !== "none" ? (
            <span className={`health-trend health-trend--${t.dir}`}>
              <span aria-hidden="true">{t.dir === "up" ? "▲" : t.dir === "down" ? "▼" : "●"} </span>
              {t.text}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  if (!rich) {
    return (
      <span className="health-trigger health-trigger--plain" role="img" aria-label={describeHealth(health, trend)}>
        {face}
      </span>
    );
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="health-trigger"
        aria-label={describeHealth(health, trend)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        onClick={() => setPinned((p) => !p)}
      >
        {face}
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="region"
              aria-label="Health score breakdown"
              className="health-pop"
              style={at ? { top: at.top, left: at.left } : { top: 0, left: 0, visibility: "hidden" }}
              onMouseEnter={enter}
              onMouseLeave={leave}
            >
              <HealthCard health={health} trend={trend} max={3} headingLevel={4} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
