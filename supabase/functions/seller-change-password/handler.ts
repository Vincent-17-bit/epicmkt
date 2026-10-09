import { passwordProblems } from "../_shared/synced/password.js";
import { auditInsert, authenticate, codeSchema, GENERIC_CODE, json, passwordSchema, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({ code: codeSchema, newPassword: passwordSchema });

export const sellerChangePassword = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!(await rateOk(d.db, `scp:${ctx.business.id}`, 20, 3600))) return rateLimited();

  const problems = passwordProblems(parsed.data.newPassword, { sellerId: ctx.business.seller_id, phone: ctx.business.phone });
  if (problems.length) return json({ error: "weak_password", problems }, 422);

  const verified = (await d.db.rpc("seller_otp_verify", { p_business: ctx.business.id, p_purpose: "change_password", p_code: parsed.data.code })).data;
  if (!verified?.ok) return json({ error: "invalid_code", message: GENERIC_CODE }, 400);

  const updated = await d.db.auth.admin.updateUserById(ctx.userId, { password: parsed.data.newPassword });
  if (updated.error) return json({ error: "server_error" }, 500);
  await d.db.rpc("revoke_user_sessions", { p_user: ctx.userId, p_keep: ctx.sessionId });
  await d.db.rpc("seller_first_login_done", { p_business: ctx.business.id });
  await auditInsert(d.db, { business_id: ctx.business.id, actor_id: ctx.userId, action: "password_changed" });
  return json({ ok: true });
});
