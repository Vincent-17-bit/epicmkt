import { json, wrap } from "../_shared/seller.ts";
import { writeAudit } from "../_shared/audit.ts";
import { cronOrRole, isResponse, type OutboundDeps } from "../_shared/outbound.ts";

// Runs once a day at 07:00 Nairobi (see supabase/cron/schedule.sql) with the x-cron-secret header.
// An owner can also run it by hand; running it again the same day is harmless.
//
// queue_billing_notices() posts the in-app notices (reminders at 7, 3 and 1 days, grace, expiry) and queues
// an SMS and, when the business has an email, an email copy of each. Every row carries a dedupe_key that includes
// the paid_until day, so a notice is created once no matter how often this runs. The dispatcher sends the copies.
export const dailyLifecycle = (d: OutboundDeps) => wrap(async (req) => {
  const actor = await cronOrRole(req, d, ["owner"]);
  if (isResponse(actor)) return actor;

  const r = await d.db.rpc("queue_billing_notices", { p_now: d.now().toISOString() });
  if (r.error) return json({ error: "server_error" }, 500);
  const result = (r.data ?? { inApp: 0, queued: 0 }) as { inApp: number; queued: number };

  await writeAudit(d.db, {
    actor: actor.kind === "admin" ? { id: actor.userId, email: actor.email } : null,
    actorRole: actor.kind === "admin" ? "admin" : "system",
    action: "lifecycle.daily",
    targetType: "system",
    after: { inApp: result.inApp, queued: result.queued },
  });

  return json({ ok: true, inApp: result.inApp, queued: result.queued });
});
