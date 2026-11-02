import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PERFORMANCE_RANGE, PERFORMANCE_METRICS, PERFORMANCE_RANGES, performanceIsEmpty } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { errorText } from "../../lib/errors.js";
import styles from "./performance.module.css";

const W = 560;
const H = 160;
const PAD = 8;

// Line chart of one metric. Plain SVG so it follows the theme through currentColor and CSS variables.
export function TrendChart({ series, metric, label }) {
  const values = series.map((p) => p[metric] ?? 0);
  const max = Math.max(1, ...values);
  const x = (i) => PAD + (values.length <= 1 ? (W - PAD * 2) / 2 : (i * (W - PAD * 2)) / (values.length - 1));
  const y = (v) => H - PAD - (v / max) * (H - PAD * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = values.length ? `${line} L${x(values.length - 1).toFixed(1)} ${H - PAD} L${x(0).toFixed(1)} ${H - PAD} Z` : "";
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} over time. Highest point ${max}.`} preserveAspectRatio="none">
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className={styles.axis} />
        {area && <path d={area} className={styles.area} />}
        {line && <path d={line} className={styles.line} fill="none" />}
        {values.length === 1 && <circle cx={x(0)} cy={y(values[0])} r="3" className={styles.dot} />}
      </svg>
      <figcaption className={styles.peak}>Highest: {max}</figcaption>
    </figure>
  );
}

// Views and taps for the whole shop, or for one item when `itemId` is given. The same for every plan.
export default function PerformancePanel({ itemId = null, title = "Performance" }) {
  const [range, setRange] = useState(DEFAULT_PERFORMANCE_RANGE);
  const [metric, setMetric] = useState("view");
  const q = useQuery({ queryKey: ["performance", itemId, range], queryFn: () => api.getPerformance(range, itemId), retry: false });
  const label = PERFORMANCE_METRICS.find((m) => m.key === metric)?.label ?? "Views";
  const id = `perf-range-${itemId ?? "shop"}`;
  return (
    <section className={styles.panel} aria-labelledby={`${id}-title`} data-testid="performance-panel">
      <header className={styles.head}>
        <h3 id={`${id}-title`}>{title}</h3>
        <label className={styles.range} htmlFor={id}>
          <span>Period</span>
          <select id={id} value={range} onChange={(e) => setRange(e.target.value)}>
            {PERFORMANCE_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
      </header>
      {q.isError && <p role="alert" className={styles.error}>{errorText(q.error)}</p>}
      {q.isLoading && <p className={styles.muted}>Loading…</p>}
      {q.data && (
        <>
          <div className={styles.tiles} role="group" aria-label="Choose what the chart shows">
            {PERFORMANCE_METRICS.map((m) => (
              <button key={m.key} type="button" className={`${styles.tile} ${metric === m.key ? styles.tileOn : ""}`} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
                <span className={styles.tileCount} data-testid={`perf-${m.key}`}>{q.data.totals[m.key]}</span>
                <span className={styles.tileLabel}>{m.label}</span>
              </button>
            ))}
          </div>
          {performanceIsEmpty(q.data) ? (
            <p className={styles.muted} data-testid="performance-empty">Nothing yet for this period. Views and taps appear here as customers find you.</p>
          ) : (
            <TrendChart series={q.data.series} metric={metric} label={label} />
          )}
        </>
      )}
    </section>
  );
}
