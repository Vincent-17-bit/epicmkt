import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import LoadError from "../components/LoadError.jsx";
import { barGeometry, funnelRows, kes, percent } from "../lib/audit.js";
import { calendarDayShort } from "../lib/time.js";

const WINDOWS = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "12 months"]];
const day = calendarDayShort;

function BarChart({ rows, valueKey, label, format = (v) => v }) {
  const { bars, max } = barGeometry(rows.map((r) => Number(r[valueKey])), { width: 600, height: 120 });
  const total = rows.reduce((s, r) => s + Number(r[valueKey]), 0);
  return (
    <figure className="chart">
      <svg viewBox="0 0 600 120" role="img" aria-label={`${label}: ${format(total)} in total, busiest day ${format(max)}`} preserveAspectRatio="none">
        {bars.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} rx="1"><title>{day(rows[i].day)}: {format(b.value)}</title></rect>)}
      </svg>
      <figcaption className="muted">{rows.length ? `${day(rows[0].day)} to ${day(rows[rows.length - 1].day)}` : ""}</figcaption>
    </figure>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-analytics", days], queryFn: () => api.getAnalytics({ days }), placeholderData: (p) => p });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Analytics</h2>
          <label className="field">Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
        </div>

        {isError ? <LoadError what="analytics" error={error} onRetry={refetch} /> : isLoading || !data ? <p>Loading…</p> : (
          <>
            <div className="stat-grid">
              {data.can_see_money && <div className="stat"><span className="muted">Revenue, {data.days} days</span><strong>{kes(data.revenue_total)}</strong></div>}
              {data.can_see_money && <div className="stat"><span className="muted">Monthly recurring</span><strong>{kes(data.mrr_kes)}</strong></div>}
              <div className="stat"><span className="muted">Live businesses</span><strong>{data.businesses.live}</strong><span className="muted">{data.businesses.premium_live} premium</span></div>
              <div className="stat"><span className="muted">Expired or suspended</span><strong>{data.businesses.expired + data.businesses.suspended}</strong></div>
              {data.can_see_money && data.renewals?.due > 0 && <div className="stat"><span className="muted">Renewal rate</span><strong>{percent(data.renewals.renewed, data.renewals.due)}%</strong><span className="muted">{data.renewals.renewed} of {data.renewals.due} that came due</span></div>}
            </div>

            {data.can_see_money && <><h3>Revenue per day</h3><BarChart rows={data.revenue_by_day} valueKey="kes" label="Revenue per day" format={kes} /></>}
            <h3>New businesses per day</h3>
            <BarChart rows={data.new_businesses_by_day} valueKey="n" label="New businesses per day" />

            {data.can_see_applications && (
              <>
                <h3>Application funnel</h3>
                {data.funnel.submitted === 0 ? <p className="muted">No applications in this period.</p> : (
                  <table className="funnel"><tbody>
                    {funnelRows(data.funnel).map((r) => (
                      <tr key={r.label}><td>{r.label}</td><td><strong>{r.value}</strong></td><td className="muted">{r.ofFirst === null ? "" : `${r.ofFirst}% of submitted`}{r.ofPrevious === null ? "" : ` · ${r.ofPrevious}% of the step before`}</td></tr>
                    ))}
                  </tbody></table>
                )}
              </>
            )}

            <h3>Live businesses by category</h3>
            <div className="table-shell">
              <table>
                <thead><tr><th scope="col">Category</th><th scope="col">Live</th>{data.can_see_money && <th scope="col">Monthly value</th>}</tr></thead>
                <tbody>{data.by_category.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.live}</td>{data.can_see_money && <td>{kes(c.monthly_kes)}</td>}</tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
