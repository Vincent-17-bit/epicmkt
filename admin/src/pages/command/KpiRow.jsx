import { Link } from "react-router-dom";
import { Card, CountUp, Skeleton, Sparkline } from "../../components/index.js";
import { formatKes, weekTrend } from "../../lib/series.js";
import s from "./command.module.css";

const sign = (n) => (n > 0 ? `+${n}` : String(n));

function Kpi({ label, value, format, note, spark, sparkLabel, series, to, loading }) {
  const body = (
    <div className={s.kpiBody}>
      <span className={s.kpiLabel}>{label}</span>
      {loading ? <Skeleton variant="rect" width="5rem" height="2.25rem" /> : <CountUp className={s.kpiValue} value={value} format={format} />}
      <div className={s.kpiFoot}>
        <p className={s.kpiNote}>{loading ? <Skeleton variant="text" width="7rem" /> : note}</p>
        {loading ? null : <Sparkline className={s.kpiSpark} values={spark} label={sparkLabel} series={series} width={96} height={32} />}
      </div>
    </div>
  );
  return to
    ? <Card as={Link} to={to} className={s.kpi} interactive padding="md">{body}</Card>
    : <Card as="div" className={s.kpi} padding="md">{body}</Card>;
}

/** The headline numbers. Each trend line is the daily inflow behind its number, so it says where the number is heading. */
export default function KpiRow({ counts, data, can, loading }) {
  const series = data?.series ?? {};
  const link = (permission, to) => (can(permission) ? to : null);
  const activations = weekTrend(series.activations);
  const submitted = weekTrend(series.applications);
  const received = weekTrend(series.payments);
  const revenue = data?.revenue ?? [];
  const thisMonth = revenue.at(-1)?.kes ?? 0;
  const lastMonth = revenue.at(-2)?.kes ?? 0;
  const dueSoon = (series.expiries ?? []).slice(0, 7).reduce((a, b) => a + b, 0);

  return (
    <div className={s.kpis} aria-label="Key numbers">
      <Kpi loading={loading} label="Live businesses" value={counts.live} to={link("businesses.view", "/admin/businesses")}
        note={`${activations.current} new in 7 days (${sign(activations.change)} vs the week before)`} spark={series.activations} sparkLabel="New businesses per day, last 14 days" series={3} />
      <Kpi loading={loading} label="Applications waiting" value={counts.submitted} to={link("applications.view", "/admin/applications?status=submitted")}
        note={`${submitted.current} submitted in 7 days (${sign(submitted.change)})`} spark={series.applications} sparkLabel="Applications submitted per day, last 14 days" series={1} />
      <Kpi loading={loading} label="Unconfirmed payments" value={counts.unconfirmed_payments} to={link("payments.view", "/admin/payments?status=submitted")}
        note={`${received.current} received in 7 days (${sign(received.change)})`} spark={series.payments} sparkLabel="Payments received per day, last 14 days" series={2} />
      <Kpi loading={loading} label="Expiring in 7 days" value={counts.expiring_7d} to={link("businesses.view", "/admin/businesses?filter=expiring")}
        note={`${counts.in_grace} in grace now · ${dueSoon} due this week`} spark={series.expiries} sparkLabel="Expiries due per day, next 14 days" series={5} />
      <Kpi loading={loading} label="Revenue this month" value={thisMonth} format={(n) => formatKes(n)} to={link("payments.view", "/admin/payments")}
        note={lastMonth ? `${sign(Math.round(((thisMonth - lastMonth) / lastMonth) * 100))}% vs last month (${formatKes(lastMonth)})` : "No confirmed payments last month"}
        spark={series.revenue} sparkLabel="Confirmed revenue per day, last 14 days" series={6} />
    </div>
  );
}
