import { useId, useRef, useState } from "react";
import { formatDate } from "@epicmkt/shared";
import styles from "./panel.module.css";

const W = 600;
const H = 140;
const PAD = 8;

const dayText = (day) => formatDate(`${day}T12:00:00Z`, { year: undefined });

export default function Chart({ series, label }) {
  const id = useId();
  const box = useRef(null);
  const [at, setAt] = useState(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...series.map((d) => d.views));
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const x = (i) => PAD + i * step;
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2);
  const points = series.map((d, i) => `${x(i)},${y(d.views)}`).join(" ");
  const peak = series.reduce((best, d, i) => (d.views > series[best].views ? i : best), 0);
  const move = (e) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !series.length) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setAt(Math.round(ratio * (series.length - 1)));
  };
  const shown = at === null ? null : series[at];
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{label}</figcaption>
      <div
        ref={box}
        className={styles.plot}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setAt(null)}
        onFocus={() => setAt(series.length - 1)}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setAt((a) => Math.max(0, (a ?? series.length - 1) - 1));
          if (e.key === "ArrowRight") setAt((a) => Math.min(series.length - 1, (a ?? series.length - 1) + 1));
          if (e.key === "Escape") setAt(null);
        }}
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use the left and right arrow keys to read each day.`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <line className={styles.base} x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} />
          <polyline className={styles.line} points={points} fill="none" />
        </svg>
        <span className={styles.peak} style={{ insetInlineStart: `${(series.length > 1 ? peak / (series.length - 1) : 0) * 100}%` }}>{series[peak]?.views ?? 0}</span>
        {shown && (
          <>
            <span className={styles.cursor} style={{ insetInlineStart: `${(series.length > 1 ? at / (series.length - 1) : 0) * 100}%` }} aria-hidden="true" />
            <span className={styles.dot} style={{ insetInlineStart: `${(series.length > 1 ? at / (series.length - 1) : 0) * 100}%`, insetBlockStart: `${(y(shown.views) / H) * 100}%` }} aria-hidden="true" />
            <span className={styles.tip} role="status" style={{ insetInlineStart: `${(series.length > 1 ? at / (series.length - 1) : 0) * 100}%` }}>
              {dayText(shown.day)}: {shown.views} {shown.views === 1 ? "view" : "views"}, {shown.taps} {shown.taps === 1 ? "tap" : "taps"}
            </span>
          </>
        )}
      </div>
      <div className={styles.axis}>
        <span>{series.length ? dayText(series[0].day) : ""}</span>
        <span>{series.length ? dayText(series[series.length - 1].day) : ""}</span>
      </div>
      <button type="button" className={styles.linkBtn} aria-expanded={table} aria-controls={`${id}-table`} onClick={() => setTable((v) => !v)}>
        {table ? "Hide table" : "View as table"}
      </button>
      {table && (
        <div id={`${id}-table`} className={styles.tableWrap} tabIndex={0} role="region" aria-label="Views and taps per day">
          <table className={styles.table}>
            <thead><tr><th scope="col">Day</th><th scope="col">Views</th><th scope="col">Taps</th></tr></thead>
            <tbody>{[...series].reverse().map((d) => <tr key={d.day}><th scope="row">{dayText(d.day)}</th><td>{d.views}</td><td>{d.taps}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
