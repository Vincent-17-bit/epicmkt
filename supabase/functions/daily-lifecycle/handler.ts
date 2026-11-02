import { json, wrap } from "../_shared/seller.ts";
import { writeAudit } from "../_shared/audit.ts";
import { cronOrRole, isResponse, limitAdmin, type OutboundDeps } from "../_shared/outbound.ts";

// Runs once a day at 07:00 Nairobi (see supabase/cron/schedule.sql) with the x-cron-secret header.
// An owner can also run it by hand; running it again the same day is harmless.
//
// queue_billing_notices() posts the in-app notices (reminders at 7, 3 and 1 days, grace, expiry) and queues
// an SMS and, when the business has an email, an email copy of each. Every row carries a dedupe_key that includes
// the paid_until day, so a notice is created once no matter how often this runs. The dispatcher sends the copies.
//
// Then snapshot_business_health() stores today's health score for every business (one row per business per day, see
// migration 0078). That is history and the 7-day trend. It is best effort: billing notices matter more, so a failure
// here is reported in the response and the audit row but never turns the run into an error. Running it again the same
// day refreshes that day's rows. When it does fail, the reason is kept (healthSnapshotError, short) in the response and the
// audit row, so a missing trend in the admin list can be traced here instead of failing silently.
const describeFailure = (e: unknown): string => {
  const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return (m || "unknown_error").slice(0, 300);
};

export const dailyLifecycle = (d: OutboundDeps) => wrap(async (req) => {
  const actor = await cronOrRole(req, d, ["owner"]);
  if (isResponse(actor)) return actor;
  const limited = await limitAdmin(d, actor, "lifecycle");
  if (limited) return limited;

  const r = await d.db.rpc("queue_billing_notices", { p_now: d.now().toISOString() });
  if (r.error) return json({ error: "server_error" }, 500);
  const result = (r.data ?? { inApp: 0, queued: 0 }) as { inApp: number; queued: number };

  let health: number | null = null;
  let healthError: string | null = null;
  try {
    const h = await d.db.rpc("snapshot_business_health", {});
    if (h.error) healthError = describeFailure(h.error);
    else if (typeof h.data === "number") health = h.data;
    else healthError = "unexpected_result";
  } catch (e) { healthError = describeFailure(e); }   // best effort, but never silent

  await writeAudit(d.db, {
    actor: actor.kind === "admin" ? { id: actor.userId, email: actor.email } : null,
    actorRole: actor.kind === "admin" ? "admin" : "system",
    action: "lifecycle.daily",
    targetType: "system",
    after: { inApp: result.inApp, queued: result.queued, healthSnapshots: health, healthSnapshotError: healthError },
  });

  return json({ ok: true, inApp: result.inApp, queued: result.queued, healthSnapshots: health, healthSnapshotError: healthError });
});
