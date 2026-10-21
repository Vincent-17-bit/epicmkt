import { daysLeft } from "./time.js";

export const GRACE_DAYS = 1;
export const EXPIRING_DAYS = 7;

export function deriveState(row, now) {
  if (row.deleted) return "deleted";
  if (row.status !== "live") return row.status;
  if (row.state) return row.state;
  const days = daysLeft(row.paidUntil, now);
  if (days < -(row.graceDays ?? GRACE_DAYS)) return "expired";
  if (days < 0) return "grace";
  if (days <= EXPIRING_DAYS) return "expiring";
  return "live";
}

export function isVisibleToCustomers(row, now) {
  return row.status === "live" && !row.deleted && daysLeft(row.paidUntil, now) >= -(row.graceDays ?? GRACE_DAYS);
}
