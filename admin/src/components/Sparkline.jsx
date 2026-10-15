import { useId } from "react";
import { cx } from "./cx.js";
import styles from "./Sparkline.module.css";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * A small trend line. `label` says what it shows ("Applications per day, last 14 days") and the
 * start, end and range are appended for screen readers, because the picture alone carries no values.
 * series: 1-6 picks the chart colour token. `area` fills under the line.
 */
export function Sparkline({ values = [], label, width = 120, height = 32, series = 1, area = true, className, ...rest }) {
  const uid = useId();
  const points = values.map(num).filter((v) => v !== null);
  const color = `var(--chart-${Math.min(6, Math.max(1, series))})`;

  if (points.length < 2) {
    return (
      <svg className={cx(styles.root, className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label ?? "Trend"}: not enough data`} {...rest}>
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} className={styles.empty} />
      </svg>
    );
  }

  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v) => (max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2));
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const fill = `${line} L${x(points.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const last = points.length - 1;
  const summary = `${label ?? "Trend"}: from ${points[0]} to ${points[last]}, low ${min}, high ${max}`;

  return (
    <svg className={cx(styles.root, className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} {...rest}>
      <title>{summary}</title>
      {area && max !== min ? <path d={fill} fill={color} className={styles.area} id={`${uid}-a`} /> : null}
      <path d={line} fill="none" stroke={color} className={styles.line} />
      <circle cx={x(last)} cy={y(points[last])} r="2.5" fill={color} className={styles.end} />
    </svg>
  );
}
