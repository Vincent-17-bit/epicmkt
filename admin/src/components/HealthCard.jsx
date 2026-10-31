import { BANDS, PARTS, describeHealth, toneOfScore, trendInfo } from "../lib/healthView.js";

const TONE_WORD = { bad: "Problem", warn: "Needs attention", note: "Minor", info: "Note" };

/**
 * The breakdown behind a health score: the four parts with their weight, the part that costs the most, and the reasons.
 * Used in the ring's tooltip (`max` limits the reasons) and on the business page (all of them).
 */
export default function HealthCard({ health, trend = null, max = null, headingLevel = 3 }) {
  if (!health || health.score === null || health.score === undefined) {
    return <p className="muted">This business has no health score.</p>;
  }
  const Heading = `h${headingLevel}`;
  const band = BANDS[health.band] ?? BANDS.none;
  const reasons = max ? health.reasons.slice(0, max) : health.reasons;
  const hidden = health.reasons.length - reasons.length;
  const t = trendInfo(trend);

  return (
    <div className="health-card">
      <div className="health-card__head">
        <span className="health-card__score" aria-label={describeHealth(health, trend)}>
          {health.score}
          <small>/100</small>
        </span>
        <span className={`health-chip health-chip--${band.tone}`}>{health.label}</span>
        {t.dir !== "none" ? (
          <span className={`health-trend health-trend--${t.dir}`} title={t.label}>
            <span aria-hidden="true">{t.dir === "up" ? "▲" : t.dir === "down" ? "▼" : "●"} </span>
            {t.text}
            <span className="sr-only">. {t.label}</span>
          </span>
        ) : null}
      </div>

      {health.capped ? (
        <p className="health-card__cap" role="note">
          Capped: one serious problem holds this score at “At risk”, whatever the other parts say.
        </p>
      ) : null}

      {health.subs ? (
        <ul className="health-parts" aria-label="Score parts">
          {PARTS.map((part) => {
            const value = health.subs[part.id];
            const tone = toneOfScore(value, health.bands);
            const weakest = health.weakest === part.id;
            return (
              <li key={part.id} className={weakest ? "health-part health-part--weakest" : "health-part"} title={part.hint}>
                <span className="health-part__name">
                  {part.label}
                  <span className="health-part__weight">{health.weights?.[part.id] ?? 0}%</span>
                </span>
                <span className="health-bar" aria-hidden="true"><span className={`health-bar__fill health-bar__fill--${tone}`} style={{ width: `${Math.max(2, value)}%` }} /></span>
                <span className="health-part__value">
                  {value}
                  {weakest ? <span className="health-part__tag">Weakest</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {reasons.length ? (
        <>
          <Heading className="health-card__sub">Why this score</Heading>
          <ul className="health-reasons">
            {reasons.map((reason, index) => (
              <li key={`${reason.part}-${index}`} className={`health-reason health-reason--${reason.tone}`}>
                <span className="health-reason__tone">{TONE_WORD[reason.tone] ?? "Note"}</span>
                <span>{reason.text}</span>
                {reason.points ? <span className="health-reason__points">−{reason.points}</span> : null}
              </li>
            ))}
          </ul>
          {hidden > 0 ? <p className="health-card__more">+{hidden} more on the business page</p> : null}
        </>
      ) : (
        <p className="health-card__clean">Nothing is costing this business points.</p>
      )}
    </div>
  );
}
