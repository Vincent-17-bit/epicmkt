import { normalizeCounts } from "./counts.js";

// Same keys as the real admin_counts() RPC, so the shell behaves the same in both modes.
export async function getAdminCounts() {
  return normalizeCounts({
    submitted: 4, under_review: 3, changes_requested: 2, awaiting_payment: 5, payment_confirming: 2,
    live: 142, expiring_7d: 6, in_grace: 2, expired: 9, suspended: 1,
    open_flags: 5, open_reports: 2, unconfirmed_payments: 8, failed_messages: 19, pending_changes: 12,
  });
}
