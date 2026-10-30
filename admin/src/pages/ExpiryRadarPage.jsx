import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import LoadError from "../components/LoadError.jsx";
import { daysLeftLabel, groupRadar, revenueAtRisk, whatsappLink } from "../lib/moderation.js";
import { businessDayShort, stampDay } from "../lib/time.js";

const WINDOWS = [[7, "7 days"], [14, "14 days"], [30, "30 days"], [60, "60 days"]];
const kes = (v) => `KES ${Number(v).toLocaleString("en-KE")}`;
const day = stampDay;

export default function ExpiryRadarPage() {
  const [days, setDays] = useState(30);
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-expiry-radar", days],
    queryFn: () => api.getExpiryRadar({ days }),
    refetchInterval: 5 * 60_000,
  });
  const groups = groupRadar(data);
  const atRisk = revenueAtRisk(data);

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Expiry Radar</h2>
          <label className="field">Look ahead
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {WINDOWS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {isError ? <LoadError what="the expiry radar" error={error} onRetry={refetch} /> : isLoading ? <p>Loading…</p> : (
          <>
            <p className="radar-summary">
              <strong>{data.length}</strong> {data.length === 1 ? "listing" : "listings"} in this window. <strong>{kes(atRisk)}</strong> a month is still to be collected (payments already waiting for confirmation are not counted).
            </p>
            {groups.map((group) => (
              <section key={group.id} className="radar-group" aria-labelledby={`radar-${group.id}`}>
                <h4 id={`radar-${group.id}`}>{group.label} <span className="tabs__count">{group.rows.length}</span></h4>
                <p className="muted">{group.hint}</p>
                {group.rows.length === 0 ? <p className="muted">None.</p> : (
                  <div className="table-shell">
                    <table>
                      <thead><tr><th scope="col">Business</th><th scope="col">Plan</th><th scope="col">Paid until</th><th scope="col">When</th><th scope="col">Last reminder</th><th scope="col">Payment</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>
                        {group.rows.map((row) => {
                          const link = whatsappLink(row.whatsapp || row.phone, `Hello ${row.name}, your EpicMKT listing needs renewing. Reply here if you need help paying.`);
                          return (
                            <tr key={row.id}>
                              <td><Link to={`/admin/businesses/${row.id}`}>{row.name}</Link></td>
                              <td>{row.plan_key} · {kes(row.monthly_price)}</td>
                              <td>{businessDayShort(row.paid_until)}</td>
                              <td>{daysLeftLabel(row)}</td>
                              <td>{row.last_reminder_at ? day(row.last_reminder_at) : "None sent"}</td>
                              <td>{row.payment_waiting ? <span className="status-pill status-pill--healthy">Waiting to confirm</span> : "–"}</td>
                              <td>{link ? <a href={link} target="_blank" rel="noreferrer" aria-label={`Message ${row.name} on WhatsApp`}>WhatsApp</a> : null}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
