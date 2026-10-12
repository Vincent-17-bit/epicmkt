import { json } from "../_shared/http.ts";
import { wrap, type Db } from "../_shared/seller.ts";
import { authorised } from "../dispatch-messages/handler.ts";

// Queues expiry and closure reminders. Each reminder is logged, so running this often is safe.
export const runReminders = (d: { db: Db; secret: string; now: () => Date }) => wrap(async (req) => {
  if (!authorised(req, d.secret)) return json({ error: "unauthorized" }, 401);
  const r = await d.db.rpc("seller_run_reminders", { p_now: d.now().toISOString() });
  if (r.error) return json({ error: "server_error" }, 500);
  return json({ ok: true, queued: r.data ?? 0 });
});
