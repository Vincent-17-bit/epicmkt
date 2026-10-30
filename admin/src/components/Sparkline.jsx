import { sparklinePoints } from "../lib/commandCenter.js";

/** A tiny trend line. Draws nothing when there is no real activity to show. */
export default function Sparkline({ values, label }) {
  const points = sparklinePoints(values);
  if (!points) return null;
  return (
    <svg className="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
