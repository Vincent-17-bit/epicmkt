import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight, faChevronRight, faCircleCheck, faCoins, faCreditCard, faFileSignature, faFlag, faHourglassHalf, faStore, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { api } from "../api/index.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAdminCounts } from "../hooks/useAdminCounts.js";
import { usePermissions } from "../hooks/usePermissions.js";
import { canReview } from "../lib/applications.js";
import { attentionRows, firstName, greeting, lastDays, shareOfMax, shortcutItems, sum } from "../lib/commandCenter.js";
import { attentionTotal, badgeText, navBadges } from "../lib/counts.js";
import { navGroups } from "../layouts/navConfig.js";
import LiveActivityPanel, { ACTIVITY_KEY } from "../components/LiveActivityPanel.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorCard from "../components/ErrorCard.jsx";
import Skeleton, { SkeletonCard } from "../components/Skeleton.jsx";
import Sparkline from "../components/Sparkline.jsx";
import { formatInstant, formatKes } from "@epicmkt/shared";

export { ACTIVITY_KEY };

const TREND_DAYS = 14;
const ROW_ICON = { applications: faFileSignature, payments: faCreditCard, flags: faFlag, failed: faTriangleExclamation };
const KPI_ICON = { live: faStore, expiring: faHourglassHalf, revenue: faCoins };
const today = () => formatInstant(new Date(), { weekday: "long", day: "numeric", month: "long" });

export default function CommandCenterPage() {
  const { admin } = useAuth();
  const { can } = usePermissions();
  const { data, isPending, isError, error, refetch, isFetching } = useAdminCounts();
  const loadingNumbers = isPending || (isError && !data);

  // Real history for the trend lines. The database only returns it when asked, and the money series only to roles
  // that may see money. If this fails or the role has no access, the cards simply have no trend line.
  const trend = useQuery({
    queryKey: ["admin-analytics", TREND_DAYS],
    queryFn: () => api.getAnalytics({ days: TREND_DAYS }),
    enabled: can("analytics.view"),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const rows = attentionRows(data, { can, canReviewApplications: canReview(admin?.role) });
  const total = attentionTotal(data);
  const waiting = rows.filter((row) => row.value > 0);
  const clear = rows.filter((row) => row.value === 0);
  const busiest = Math.max(0, ...waiting.map((row) => row.value));

  const newBusinesses = lastDays(trend.data?.new_businesses_by_day, "n", TREND_DAYS);
  const revenue = trend.data?.can_see_money ? lastDays(trend.data.revenue_by_day, "kes", TREND_DAYS) : [];
  const kpis = [
    {
      id: "live",
      label: "Live businesses",
      value: data?.liveBusinesses,
      to: "/admin/businesses",
      context: newBusinesses.length ? (sum(newBusinesses) ? `${sum(newBusinesses)} new in ${TREND_DAYS} days` : `None new in ${TREND_DAYS} days`) : "",
      trend: newBusinesses,
      trendLabel: `New businesses per day, last ${TREND_DAYS} days`,
    },
    { id: "expiring", label: "Expiring in 7 days", value: data?.expiringSoon, to: "/admin/businesses", context: data?.inGrace ? `${data.inGrace} more in the grace period` : "" },
    ...(revenue.length
      ? [{ id: "revenue", label: `Revenue, last ${TREND_DAYS} days`, value: formatKes(sum(revenue)), to: "/admin/analytics", context: "", trend: revenue, trendLabel: `Revenue per day, last ${TREND_DAYS} days` }]
      : []),
  ];

  const actions = [
    can("applications.view") ? { label: "Review applications", to: "/admin/applications" } : null,
    can("payments.view") ? { label: "Confirm payments", to: "/admin/payments" } : null,
    can("messages.view") ? { label: "Send broadcast", to: "/admin/broadcasts" } : null,
  ].filter(Boolean);

  const badges = navBadges(data);
  const shortcuts = shortcutItems(navGroups, can);
  const name = firstName(admin);
  const lede = loadingNumbers
    ? "Checking what needs you."
    : total > 0
      ? `${total === 1 ? "One thing needs" : `${total} things need`} your attention today.`
      : "Nothing is waiting. Enjoy the quiet.";

  return (
    <div className="page-shell cc-page">
      {isError && data ? (
        <div className="banner banner--error" role="alert">
          <span>Could not refresh the numbers, so these may be out of date.</span>
          <button type="button" className="secondary-button admin-button admin-button--sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Trying again…" : "Try again"}
          </button>
        </div>
      ) : null}

      <header className="cc-hero">
        <div className="cc-hero__text">
          <p className="cc-hero__date">{today()}</p>
          <p className="cc-hero__title">{greeting()}{name ? `, ${name}` : ""}</p>
          <p className="cc-hero__lede">{lede}</p>
        </div>
        {actions.length ? (
          <div className="cc-actions">
            {actions.map((action, index) => (
              <Link key={action.to} to={action.to} className={`admin-button ${index === 0 && total > 0 ? "primary-button" : "secondary-button"}`}>
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      <section className="cc-kpis" aria-label="Business overview">
        {loadingNumbers && isPending
          ? Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} label="Loading business numbers" />)
          : kpis.map((item) => (
              <Link key={item.id} to={item.to} className={`kpi-card kpi-card--link kpi-card--${item.id}`}>
                <span className="kpi-card__top">
                  <span className="kpi-card__icon" aria-hidden="true"><FontAwesomeIcon icon={KPI_ICON[item.id]} /></span>
                  <span className="kpi-card__label">{item.label}</span>
                  <FontAwesomeIcon icon={faArrowRight} className="kpi-card__go" aria-hidden="true" />
                </span>
                <strong className="kpi-card__value">{typeof item.value === "string" ? item.value : (loadingNumbers ? "--" : item.value ?? "--")}</strong>
                {item.context ? <span className="kpi-card__context">{item.context}</span> : null}
                {item.trend ? <Sparkline values={item.trend} label={item.trendLabel} /> : null}
              </Link>
            ))}
      </section>

      <div className="cc">
        <section className="panel cc-focus" aria-labelledby="cc-attention">
          <div className="cc-focus__head">
            <h2 id="cc-attention" className="cc-focus__title">Needs attention</h2>
            {!loadingNumbers && total > 0 ? (
              <p className="cc-focus__summary">
                <strong className="cc-focus__total">{total}</strong>
                {total === 1 ? "item is waiting for you" : "items are waiting for you"}
              </p>
            ) : null}
          </div>

          {isError && !data ? (
            <ErrorCard what="the numbers" error={error} onRetry={() => refetch()} retrying={isFetching} />
          ) : isPending ? (
            <div className="skeleton-group" role="status" aria-busy="true">
              <span className="sr-only">Loading what needs attention</span>
              <Skeleton variant="value" />
              <Skeleton />
              <Skeleton />
            </div>
          ) : total === 0 ? (
            <EmptyState
              icon={faCircleCheck}
              title="You’re all caught up"
              action={can("businesses.view") ? { label: "Review businesses", to: "/admin/businesses" } : undefined}
            >
              Nothing is waiting for you. New work shows up here as it arrives.
            </EmptyState>
          ) : (
            <>
              <ul className="cc-rows">
                {waiting.map((row) => {
                  const body = (
                    <>
                      <span className={`cc-row__icon cc-row__icon--${row.id}`} aria-hidden="true"><FontAwesomeIcon icon={ROW_ICON[row.id]} /></span>
                      <span className="cc-row__text">
                        <span className="cc-row__label">{row.label}</span>
                        {row.note ? <span className="cc-row__note">{row.note}</span> : null}
                        <span className="cc-row__meter" aria-hidden="true"><i style={{ width: `${shareOfMax(row.value, busiest)}%` }} /></span>
                      </span>
                      <strong className="cc-row__value">{row.value}</strong>
                      {row.to ? <FontAwesomeIcon icon={faChevronRight} className="cc-row__go" aria-hidden="true" /> : null}
                    </>
                  );
                  return <li key={row.id}>{row.to ? <Link to={row.to} className="cc-row">{body}</Link> : <div className="cc-row">{body}</div>}</li>;
                })}
              </ul>
              {clear.length ? <p className="cc-clear"><FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" /> Nothing waiting: {clear.map((row) => row.label.toLowerCase()).join(", ")}.</p> : null}
            </>
          )}
        </section>

        <LiveActivityPanel />
      </div>

      {shortcuts.length ? (
        <section className="cc-shortcuts" aria-labelledby="cc-shortcuts-title">
          <h2 id="cc-shortcuts-title" className="cc-shortcuts__title">Go to</h2>
          <ul className="cc-tiles">
            {shortcuts.map((item) => {
              const count = badgeText(badges[item.to]);
              return (
                <li key={item.to}>
                  <Link to={item.to} className="cc-tile">
                    <span className="cc-tile__icon" aria-hidden="true"><FontAwesomeIcon icon={item.icon} /></span>
                    <span className="cc-tile__label">{item.label}</span>
                    {count ? <b className="cc-tile__count">{count}<span className="sr-only"> {item.hint}</span></b> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
