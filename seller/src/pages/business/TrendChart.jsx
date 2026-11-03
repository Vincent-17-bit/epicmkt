import { useId, useRef, useState } from "react";
import { GRAIN_UNIT, bucketLabel, fullLabel, indexAt, labelIndexes, niceMax, peakIndex } from "./trendAxes.js";
import styles from "./performance.module.css";

const W = 560;
const H = 160;
const PAD = 8;
const SPARSE_POINTS = 6;

export default function TrendChart({ series, metric, label, grain = "day" }) {
  const [active, setActive] = useState(null);
  const [table, setTable] = useState(false);
  const plot = useRef(null);
  const tableId = useId();
  const values = series.map((p) => p[metric] ?? 0);
  const n = values.length;
  const max = Math.max(1, ...values);
  const { top, ticks } = niceMax(max);
  const x = (i) => PAD + (n <= 1 ? (W - PAD * 2) / 2 : (i * (W - PAD * 2)) / (n - 1));
  const y = (v) => H - PAD - (v / top) * (H - PAD * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = n ? `${line} L${x(n - 1).toFixed(1)} ${H - PAD} L${x(0).toFixed(1)} ${H - PAD} Z` : "";
  const first = series[0]?.bucket;
  const last = series[n - 1]?.bucket;
  const withYear = Boolean(first && last && first.slice(0, 4) !== last.slice(0, 4));
  const marks = labelIndexes(n);
  const unit = GRAIN_UNIT[grain] ?? "day";
  const range = first && last ? `, from ${bucketLabel(first, grain, withYear)} to ${bucketLabel(last, grain, withYear)}` : "";
  const peak = peakIndex(values);
  const nonZero = values.filter((v) => v > 0).length;
  const sparse = nonZero > 0 && nonZero <= SPARSE_POINTS;
  const pct = (i) => (x(i) / W) * 100;
  const topPct = (v) => (y(v) / H) * 100;

  const move = (e) => {
    const r = plot.current?.getBoundingClientRect();
    if (!r || !r.width || !n) return;
    const frac = (((e.clientX - r.left) / r.width) * W - PAD) / (W - PAD * 2);
    setActive(indexAt(frac, n));
  };
  const key = (e) => {
    const at = active ?? peak;
    const next = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setActive(Math.max(0, Math.min(n - 1, next)));
  };

  return (
    <figure className={styles.chart}>
      <div className={styles.chartHead}>
        <span className={styles.axisTitle} aria-hidden="true">{label} per {unit}</span>
        <button type="button" className={styles.linkBtn} aria-pressed={table} aria-controls={tableId} onClick={() => setTable((t) => !t)}>{table ? "View as chart" : "View as table"}</button>
      </div>
      {table ? (
        <div id={tableId} className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${label} by ${unit}`}>
          <table className={styles.dataTable}>
            <thead><tr><th scope="col">{unit === "month" ? "Month" : unit === "week" ? "Week starting" : "Day"}</th><th scope="col">{label}</th></tr></thead>
            <tbody>{series.map((p, i) => <tr key={p.bucket}><th scope="row">{fullLabel(p.bucket, grain)}</th><td>{values[i]}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <>
          <div className={styles.plotWrap}>
            <div className={styles.yLabels} aria-hidden="true">
              {ticks.map((t) => <span key={t} style={{ top: `${topPct(t)}%` }}>{t}</span>)}
            </div>
            <div
              ref={plot}
              className={styles.plot}
              tabIndex={0}
              role="group"
              aria-label={`${label} over time${range}. Highest point ${max}. Use the left and right arrow keys to read each ${unit}.`}
              onPointerMove={move}
              onPointerDown={move}
              onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
              onKeyDown={key}
              onBlur={() => setActive(null)}
            >
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                {ticks.slice(1).map((t) => <line key={t} x1={PAD} x2={W - PAD} y1={y(t)} y2={y(t)} className={styles.grid} />)}
                <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className={styles.axis} />
                {area && !sparse && <path d={area} className={styles.area} />}
                {line && <path d={line} className={sparse ? `${styles.line} ${styles.lineFaint}` : styles.line} fill="none" />}
              </svg>
              {(sparse ? values.map((v, i) => (v > 0 && !(i === peak && active === null) ? i : -1)).filter((i) => i >= 0) : []).map((i) => (
                <span key={i} className={styles.point} style={{ left: `${pct(i)}%`, top: `${topPct(values[i])}%` }} aria-hidden="true" />
              ))}
              {values[peak] > 0 && active === null && (
                <span className={styles.peakTag} style={{ left: `${pct(peak)}%`, top: `${topPct(values[peak])}%` }} data-edge={pct(peak) > 80 ? "end" : pct(peak) < 20 ? "start" : "mid"} aria-hidden="true">
                  <span className={styles.point} />
                  <span className={styles.peakText}>Peak {values[peak]}</span>
                </span>
              )}
              {active !== null && (
                <>
                  <span className={styles.cross} style={{ left: `${pct(active)}%` }} aria-hidden="true" />
                  <span className={`${styles.point} ${styles.pointOn}`} style={{ left: `${pct(active)}%`, top: `${topPct(values[active])}%` }} aria-hidden="true" />
                  <span className={styles.tip} style={{ left: `${pct(active)}%` }} data-side={pct(active) > 60 ? "left" : "right"} aria-hidden="true">
                    <span className={styles.tipDate}>{fullLabel(series[active].bucket, grain)}</span>
                    <span className={styles.tipValue}><strong>{values[active]}</strong> {label.toLowerCase()}</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className={styles.xLabels} aria-hidden="true">
            {marks.map((i, k) => (
              <span key={i} style={{ left: `${pct(i)}%` }} data-edge={k === 0 ? "start" : k === marks.length - 1 && marks.length > 1 ? "end" : "mid"}>{bucketLabel(series[i].bucket, grain, withYear)}</span>
            ))}
          </div>
          <span className={styles.srOnly} role="status" aria-live="polite">{active !== null ? `${fullLabel(series[active].bucket, grain)}: ${values[active]} ${label.toLowerCase()}` : ""}</span>
        </>
      )}
      <figcaption className={styles.peak}>Highest: {max}</figcaption>
    </figure>
  );
}
