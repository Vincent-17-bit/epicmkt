import { countdown, healthTone } from "../lib/businesses.js";

// One SVG ring. `fraction` is 0..1; the tone picks the colour through CSS so light and dark both work.
function Ring({ fraction, size, stroke, tone, children, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(Math.max(Number.isFinite(fraction) ? fraction : 0, 0), 1);
  return (
    <span className={`ring ring--${tone}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle className="ring__bar" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ring__text">{children}</span>
    </span>
  );
}

// 0..100 business health (profile, catalogue, listing, flags). Text is the number so colour is never the only signal.
export function HealthRing({ score, size = 38 }) {
  const known = Number.isFinite(score);
  return (
    <Ring fraction={known ? score / 100 : 0} size={size} stroke={size > 50 ? 6 : 4} tone={healthTone(score)} label={known ? `Health ${score} out of 100` : "Health unknown"}>
      {known ? Math.round(score) : "–"}
    </Ring>
  );
}

// Days left of the paid month (ring capped at 30 days). Shows the number, "G" during the grace day, "!" once expired.
export function CountdownRing({ paidUntil, size = 38, now }) {
  const c = countdown(paidUntil, now);
  const text = c.state === "active" ? c.daysLeft : c.state === "grace" ? "G" : c.state === "expired" ? "!" : "–";
  return (
    <Ring fraction={c.fraction} size={size} stroke={size > 50 ? 7 : 4} tone={c.tone} label={c.label}>
      {text}
    </Ring>
  );
}
