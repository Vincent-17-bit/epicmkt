import { json, readJson, wrap, z } from "../_shared/seller.ts";
import { writeAudit } from "../_shared/audit.ts";
import { cronOrRole, isResponse, limitAdmin, type OutboundDeps, type SendResult } from "../_shared/outbound.ts";

// Runs every minute from pg_cron (see supabase/cron/schedule.sql) with the x-cron-secret header.
// An owner or support admin can also run it by hand.
//
// Audit (owner decision D2b): a run an admin starts by hand writes one 'dispatch.run' row with the counts. Cron runs
// write none: they fire every minute, and a message that finally fails already raises an admin notification.
//
// All state lives in SQL: claim_due_messages() holds back promotional SMS/email during quiet hours and leases
// the rest; record_message_result() applies the retry policy (3 attempts, then 'failed' plus an admin notification).
// This function only talks to the providers.
const Body = z.object({ limit: z.number().int().min(1).max(200).default(50) });

type Claimed = { id: string; channel: "sms" | "email" | "in_app"; to_address: string | null; subject: string; body: string };

export const dispatchMessages = (d: OutboundDeps) => wrap(async (req) => {
  const actor = await cronOrRole(req, d, ["owner", "support"]);
  if (isResponse(actor)) return actor;
  const limited = await limitAdmin(d, actor, "dispatch");
  if (limited) return limited;

  const parsed = Body.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return json({ error: "bad_request" }, 400);

  const claim = await d.db.rpc("claim_due_messages", { p_now: d.now().toISOString(), p_limit: parsed.data.limit });
  if (claim.error) return json({ error: "server_error" }, 500);
  const rows: Claimed[] = claim.data ?? [];

  const tally = { claimed: rows.length, sent: 0, retried: 0, failed: 0, skipped: 0 };
  for (const m of rows) {
    let result: SendResult;
    let finalStatus: "sent" | "delivered" = "sent";

    if (m.channel === "in_app") {
      // Nothing to send: the message becomes visible in the seller's inbox once it is delivered.
      result = { ok: true, providerId: "in_app" };
      finalStatus = "delivered";
    } else if (d.dev) {
      // Dev mode: send nothing, record it as sent.
      result = { ok: true, providerId: "dev" };
    } else if (!m.to_address) {
      result = { ok: false, error: "no_recipient_address" };
    } else {
      try {
        result = m.channel === "sms" ? await d.sendSms(m.to_address, m.body) : await d.sendEmail(m.to_address, m.subject, m.body);
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? `provider_${e.name}` : "provider_error" };
      }
    }

    const rec = await d.db.rpc("record_message_result", {
      p_id: m.id,
      p_ok: result.ok,
      p_provider_id: result.ok ? result.providerId : null,
      p_error: result.ok ? null : result.error,
      p_cost: result.ok ? (result.cost ?? null) : null,
      p_now: d.now().toISOString(),
      p_final_status: finalStatus,
    });
    switch (rec.data) {
      case "sent": tally.sent++; break;
      case "retry": tally.retried++; break;
      case "failed": tally.failed++; break;
      default: tally.skipped++;
    }
  }

  // Hand-run only. As in the other functions, if the audit write fails the request fails (500).
  if (actor.kind === "admin") {
    await writeAudit(d.db, {
      actor: { id: actor.userId, email: actor.email },
      action: "dispatch.run",
      targetType: "system",
      after: { limit: parsed.data.limit, dev: d.dev, ...tally },
      req,
    });
  }

  return json({ ok: true, dev: d.dev, ...tally });
});
