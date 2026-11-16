import { sparklinePoints } from "../lib/commandCenter.js";

/** A small trend line with a soft area under it. Draws nothing when there is no real activity to show. */
export default function Sparkline({ values, label }) {
  const points = sparklinePoints(values, { height: 24 });
  if (!points) return null;
  const last = points.split(" ").pop().split(",");
  return (
    <svg className="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label}>
      <g transform="translate(0 2)">
        <polygon className="sparkline__area" points={`0,26 ${points} 100,26`} />
        <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
        <circle className="sparkline__dot" cx={last[0]} cy={last[1]} r="0" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
