import { auditInsert, authenticate, json, rateLimited, rateOk, wrap, type Deps } from "../_shared/seller.ts";

// Signs every other device out and keeps the session making this request.
export const sellerSignoutOthers = (d: Deps) => wrap(async (req) => {
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!(await rateOk(d.db, `sso:${ctx.business.id}`, 10, 3600))) return rateLimited();
  if (!ctx.sessionId) return json({ error: "session_unknown" }, 400);
  const r = await d.db.rpc("revoke_user_sessions", { p_user: ctx.userId, p_keep: ctx.sessionId });
  if (r.error) return json({ error: "server_error" }, 500);
  await auditInsert(d.db, { business_id: ctx.business.id, actor_id: ctx.userId, action: "signed_out_other_devices", data: { sessions: r.data ?? 0 } });
  return json({ ok: true, signedOut: r.data ?? 0 });
});
