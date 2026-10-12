import { api } from "../api/index.js";
import { useQuery } from "@tanstack/react-query";

export default function CommandCenterPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-counts"],
    queryFn: () => api.getAdminCounts(),
  });

  const kpis = [
    { label: "Live businesses", value: data?.liveBusinesses ?? 0 },
    { label: "Applications waiting", value: data?.applicationsWaiting ?? 0 },
    { label: "Unconfirmed payments", value: data?.unconfirmedPayments ?? 0 },
    { label: "Expiring in 7 days", value: data?.expiringSoon ?? 0 },
  ];

  return (
    <div className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Today’s brief</p>
          <h2>
            {data?.brief ?? "4 applications are waiting, 2 payments need confirming and 6 sellers expire this week"}
          </h2>
        </div>
        <div className="hero-card__actions">
          <button type="button" className="primary-button">Review queue</button>
          <button type="button" className="secondary-button">Confirm payments</button>
          <button type="button" className="secondary-button">Send broadcast</button>
        </div>
      </section>

      <div className="kpi-grid">
        {kpis.map((item) => (
          <div key={item.label} className="kpi-card">
            <span className="kpi-card__label">{item.label}</span>
            <strong>{isLoading ? "--" : item.value}</strong>
            <div className="sparkline" aria-hidden="true" />
          </div>
        ))}
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel__header">
            <h3>Needs your attention</h3>
            <span className="link-button">View all</span>
          </div>
          <ul className="stack-list">
            <li><span>Applications over 24h</span><strong>4</strong></li>
            <li><span>Payments awaiting confirmation</span><strong>2</strong></li>
            <li><span>Open flags</span><strong>9</strong></li>
            <li><span>Failed messages</span><strong>3</strong></li>
          </ul>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h3>Live activity</h3>
            <span className="link-button">Realtime</span>
          </div>
          <ul className="activity-list">
            <li>New application from Umoja Market submitted 2 minutes ago</li>
            <li>Payment code MPESA-1047 matched and awaiting confirmation</li>
            <li>2 seller reports were flagged for review</li>
            <li>Reminder batch completed for 6 expiring sellers</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
