import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/index.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminCounts } from "../hooks/useAdminCounts.js";
import { canReview, describeError } from "../lib/applications.js";
import { briefFor } from "../lib/counts.js";
import { describeActivity } from "../lib/activity.js";
import { timeAgo } from "../lib/time.js";

export const ACTIVITY_KEY = ["admin-activity"];

export default function CommandCenterPage() {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const { data, isPending, isError, error, refetch, isFetching } = useAdminCounts();
  const activity = useQuery({
    queryKey: ACTIVITY_KEY,
    queryFn: () => api.getAdminActivity({ limit: 15 }),
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  // "--" while loading or when the numbers could not be fetched. Never a made-up zero.
  const show = (value) => (isPending || (isError && !data) ? "--" : value ?? "--");

  const kpis = [
    { label: "Live businesses", value: data?.liveBusinesses, to: "/admin/businesses" },
    { label: "Applications waiting", value: data?.applicationsWaiting, to: "/admin/applications" },
    { label: "Payments to confirm", value: data?.unconfirmedPayments, to: "/admin/payments" },
    { label: "Expiring in 7 days", value: data?.expiringSoon, to: "/admin/businesses" },
  ];

  // The "over 24h" figure comes from the applications table, which only owner and reviewer may read.
  // For other roles it would read as a misleading zero, so the row is left out.
  const attention = [
    canReview(admin?.role) && data?.applicationsOver24h !== null && data?.applicationsOver24h !== undefined
      ? { label: "Applications waiting over 24h", value: data.applicationsOver24h, to: "/admin/applications" }
      : null,
    { label: "Payments awaiting confirmation", value: data?.unconfirmedPayments, to: "/admin/payments" },
    { label: "Open flags", value: data?.openFlags },
    { label: "Failed messages", value: data?.failedMessages },
  ].filter(Boolean);

  return (
    <div className="page-shell">
      {isError ? (
        <div className="banner banner--error" role="alert">
          <span>
            {data ? "Could not refresh the numbers, so these may be out of date." : "Could not load the numbers."}{" "}
            {describeError(error)}
          </span>
          <button type="button" className="secondary-button admin-button--sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Retrying" : "Try again"}
          </button>
        </div>
      ) : null}

      <section className="hero-card">
        <div>
          <p className="eyebrow">Today’s brief</p>
          <h2>{data ? briefFor(data) : isError ? "The brief is unavailable until the numbers load" : "Loading today’s brief"}</h2>
        </div>
        <div className="hero-card__actions">
          <button type="button" className="primary-button" onClick={() => navigate("/admin/applications")}>Review queue</button>
          <button type="button" className="secondary-button" onClick={() => navigate("/admin/payments")}>Confirm payments</button>
          <button type="button" className="secondary-button">Send broadcast</button>
        </div>
      </section>

      <div className="kpi-grid">
        {kpis.map((item) => (
          <Link key={item.label} to={item.to} className="kpi-card kpi-card--link">
            <span className="kpi-card__label">{item.label}</span>
            <strong>{show(item.value)}</strong>
            <div className="sparkline" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel__header">
            <h3>Needs your attention</h3>
          </div>
          <ul className="stack-list">
            {attention.map((item) => (
              <li key={item.label}>
                {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
                <strong>{show(item.value)}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h3>Live activity</h3>
          </div>
          {activity.isPending ? (
            <p className="muted">Loading activity</p>
          ) : activity.isError && !activity.data ? (
            <div className="banner banner--error" role="alert">
              <span>Could not load the activity. {describeError(activity.error)}</span>
              <button type="button" className="secondary-button admin-button--sm" onClick={() => activity.refetch()} disabled={activity.isFetching}>
                {activity.isFetching ? "Retrying" : "Try again"}
              </button>
            </div>
          ) : activity.data?.length ? (
            <ul className="activity-list">
              {activity.data.map((row) => {
                const { text, to } = describeActivity(row);
                return (
                  <li key={row.id}>
                    {to ? <Link to={to}>{text}</Link> : <span>{text}</span>}
                    {row.at ? <time className="muted" dateTime={row.at}> · {timeAgo(row.at)}</time> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Nothing has happened yet. New applications, payments and seller requests show up here as they arrive.</p>
          )}
        </section>
      </div>
    </div>
  );
}
