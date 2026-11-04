import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PERFORMANCE_RANGE, PERFORMANCE_METRICS, PERFORMANCE_RANGES, performanceIsEmpty } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { errorText } from "../../lib/errors.js";
import TrendChart from "./TrendChart.jsx";
import styles from "./performance.module.css";

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
            <TrendChart series={q.data.series} grain={q.data.grain} metric={metric} label={label} />
          )}
        </>
      )}
    </section>
  );
}
