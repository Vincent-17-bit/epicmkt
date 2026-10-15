// Shapes the raw rows the live API fetches (or the mock invents) into what the Command Center draws.
// Pure, so the same function serves both modes and the tests.
import { bucketDaily, bucketMonthly, dayKeys, monthKeys } from "../lib/series.js";

/**
 * raw = {
 *   waitingOver24h, oldest: { applications: {id, at}|null, payments, flags, failedMessages, changes, expiry },
 *   applications:   [{ submitted_at }]            last 14 days
 *   payments:       [{ created_at }]              last 14 days
 *   confirmed:      [{ confirmed_at, amount_kes }] last 6 months
 *   activations:    [{ first_paid_at }]           last 6 months
 *   lapses:         [{ paid_until }]              last 6 months, already in the past
 *   upcoming:       [{ paid_until }]              next 14 days
 * }
 */
export function buildDashboard(raw, now = new Date()) {
  const back = dayKeys(14, now, "back");
  const forward = dayKeys(14, now, "forward");
  const months = monthKeys(6, now);

  const revenue = bucketMonthly(raw.confirmed, "confirmed_at", months, "amount_kes");
  const added = bucketMonthly(raw.activations, "first_paid_at", months);
  const lapsed = bucketMonthly(raw.lapses, "paid_until", months);

  return {
    asOf: new Date(now).toISOString(),
    waitingOver24h: Math.max(0, Number(raw.waitingOver24h) || 0),
    oldest: {
      applications: raw.oldest?.applications ?? null,
      payments: raw.oldest?.payments ?? null,
      flags: raw.oldest?.flags ?? null,
      failedMessages: raw.oldest?.failedMessages ?? null,
      changes: raw.oldest?.changes ?? null,
      expiry: raw.oldest?.expiry ?? null,
    },
    // Each sparkline is the inflow behind its number, per day.
    series: {
      activations: bucketDaily(raw.activations, "first_paid_at", back),
      applications: bucketDaily(raw.applications, "submitted_at", back),
      payments: bucketDaily(raw.payments, "created_at", back),
      expiries: bucketDaily(raw.upcoming, "paid_until", forward), // looks forward: expiries due in the next 14 days
      revenue: bucketDaily(raw.confirmed, "confirmed_at", back, "amount_kes"),
    },
    revenue: months.map((m, i) => ({ ...m, kes: revenue[i] })),
    newVsLapsed: months.map((m, i) => ({ ...m, added: added[i], lapsed: lapsed[i] })),
  };
}
