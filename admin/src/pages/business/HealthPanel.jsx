import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import HealthCard from "../../components/HealthCard.jsx";
import HealthRing from "../../components/HealthRing.jsx";
import LoadError from "../../components/LoadError.jsx";
import { BANDS, historyStrip, readHealth, trendInfo } from "../../lib/healthView.js";

const shortDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "UTC" });

/** The health score for one business: what it is, why, and how it has moved over 30 days. */
export default function HealthPanel({ businessId }) {
  const query = useQuery({ queryKey: ["admin-business-health", businessId], queryFn: () => api.getBusinessHealth(businessId), retry: false, staleTime: 30_000 });

  if (query.isPending) return <section className="health-panel" aria-busy="true"><p className="muted">Loading health…</p></section>;
  if (query.isError) return <section className="health-panel"><LoadError what="the health score" error={query.error} onRetry={query.refetch} /></section>;

  const health = readHealth({ health: query.data.current, healthScore: query.data.current?.score });
  const strip = historyStrip(query.data.history);
  const known = strip.filter((d) => d.score !== null);
  // Trend: today's score against the newest snapshot that is at least 7 days old.
  const old = [...strip].slice(0, 23).reverse().find((d) => d.score !== null);
  const trend = old && health.score !== null ? health.score - old.score : null;
  const t = trendInfo(trend);

  return (
    <section className="health-panel" aria-labelledby="health-panel-title">
      <div>
        <h3 id="health-panel-title" className="health-panel__title">Health</h3>
        <p className="health-panel__note">How likely this business is to keep paying: listing quality, fresh prices, recent activity and a clean record.</p>
      </div>

      <div className="health-panel__top">
        <div className="health-panel__ring">
          <HealthRing health={health} size={88} interactive={false} />
          <span className={`health-chip health-chip--${BANDS[health.band]?.tone ?? "neutral"}`}>{health.label}</span>
          {t.dir !== "none" ? <span className={`health-trend health-trend--${t.dir}`}>{t.dir === "up" ? "▲ " : t.dir === "down" ? "▼ " : ""}{t.text} <span className="sr-only">{t.label}</span></span> : null}
        </div>
        <HealthCard health={health} trend={null} />
      </div>

      {known.length ? (
        <div className="health-history">
          <h4 className="health-card__sub">Last 30 days</h4>
          <ul className="health-history__strip" aria-label={`Daily health band for the last 30 days. ${known.length} days recorded.`}>
            {strip.map((d) => (
              <li key={d.day} title={d.score === null ? `${shortDay(d.day)}: not recorded` : `${shortDay(d.day)}: ${d.score}, ${BANDS[d.band]?.label}`}>
                <span className={`health-history__cell health-history__cell--${d.band ?? "none"}`} style={{ height: d.score === null ? "3px" : `${Math.max(12, d.score)}%` }} />
                <span className="sr-only">{shortDay(d.day)}: {d.score === null ? "not recorded" : `${d.score}, ${BANDS[d.band]?.label}`}</span>
              </li>
            ))}
          </ul>
          <div className="health-history__axis" aria-hidden="true"><span>{shortDay(strip[0].day)}</span><span>Today</span></div>
        </div>
      ) : (
        <p className="health-panel__note">History starts tomorrow: a score is saved once a day.</p>
      )}
    </section>
  );
}
