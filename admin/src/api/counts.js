// The keys of public.admin_counts() in supabase/migrations/0008_admin.sql. Missing or non-numeric values become 0.
export const COUNT_KEYS = [
  "submitted", "under_review", "changes_requested", "awaiting_payment", "payment_confirming",
  "live", "expiring_7d", "in_grace", "expired", "suspended",
  "open_flags", "open_reports", "unconfirmed_payments", "failed_messages", "pending_changes",
];

export function normalizeCounts(raw) {
  const out = {};
  for (const key of COUNT_KEYS) {
    const n = Number(raw?.[key]);
    out[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}
