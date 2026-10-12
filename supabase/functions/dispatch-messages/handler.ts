import { deliveryDecision } from "../_shared/synced/settings.js";
import { escapeHtml, json } from "../_shared/http.ts";
import { wrap, type Db } from "../_shared/seller.ts";

export type DispatchDeps = {
  db: Db;
  sms: (to: string, message: string) => Promise<boolean>;
  mail: (to: string, subject: string, html: string) => Promise<boolean>;
  secret: string;
  now: () => Date;
};

const same = (a: string, b: string) => a.length === b.length && a.length > 0 && [...a].reduce((n, ch, i) => n | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
export const authorised = (req: Request, secret: string) => same(req.headers.get("x-dispatch-secret") ?? "", secret);

// Sends due SMS and email from the outbox. Preferences and quiet hours are checked again at send time,
// so a change made after a message was queued still applies.
export const dispatchMessages = (d: DispatchDeps) => wrap(async (req) => {
  if (!authorised(req, d.secret)) return json({ error: "unauthorized" }, 401);
  const claimed = await d.db.rpc("outbox_claim", { p_limit: 50 });
  if (claimed.error) return json({ error: "server_error" }, 500);
  const stats = { claimed: 0, sent: 0, skipped: 0, delayed: 0, failed: 0 };
  for (const row of (claimed.data ?? []) as any[]) {
    stats.claimed += 1;
    const decision = deliveryDecision({ event: row.event, channel: row.channel, kind: row.kind, settings: row.settings, now: d.now() });
    if (decision.action === "skip") {
      await d.db.rpc("outbox_finish", { p_id: row.id, p_status: "skipped", p_error: decision.reason ?? null });
      stats.skipped += 1;
      continue;
    }
    if (decision.action === "delay") {
      await d.db.rpc("outbox_finish", { p_id: row.id, p_status: "pending", p_deliver_after: decision.until.toISOString() });
      stats.delayed += 1;
      continue;
    }
    let ok = false;
    try {
      ok = row.channel === "sms"
        ? await d.sms(row.to_address, row.body)
        : await d.mail(row.to_address, row.subject ?? "EpicMKT", `<p>${escapeHtml(row.body)}</p>`);
    } catch (_) {
      ok = false;
    }
    if (ok) {
      await d.db.rpc("outbox_finish", { p_id: row.id, p_status: "sent" });
      stats.sent += 1;
    } else {
      await d.db.rpc("outbox_finish", { p_id: row.id, p_status: (row.attempts ?? 1) >= 5 ? "failed" : "pending", p_error: "send_failed" });
      stats.failed += 1;
    }
  }
  return json({ ok: true, ...stats });
});
