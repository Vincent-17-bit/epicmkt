const STROKE = 3.5;

export default function HealthRing({ score, size = 44 }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = value >= 70 ? "var(--primary)" : value >= 40 ? "var(--text)" : "var(--danger)";

  return (
    <span className="health-ring" style={{ "--ring-size": `${size}px` }} role="img" aria-label={`Health score ${value} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="health-ring__value">{value}</span>
    </span>
  );
}
