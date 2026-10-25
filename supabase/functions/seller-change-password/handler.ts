import { passwordProblems } from "../_shared/synced/password.js";
import { auditInsert, authenticate, codeSchema, GENERIC_CODE, json, passwordSchema, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

// The code can have been sent by SMS or to the verified email; either way it is checked the same way.
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

  const updated = await d.db.auth.admin.updateUserById(ctx.userId, { password: parsed.data.newPassword, user_metadata: { must_change_password: false } });
  if (updated.error) return json({ error: "server_error" }, 500);
  // Saved on the business too: the seller now has a password of their own, so the "finish setting up" prompt can go.
  const saved = await d.db.from("businesses").update({ must_change_password: false, password_changed_at: new Date().toISOString() }).eq("id", ctx.business.id);
  if (saved?.error) return json({ error: "server_error" }, 500);
  await d.db.rpc("revoke_user_sessions", { p_user: ctx.userId, p_keep: ctx.sessionId });
  await auditInsert(d.db, { business_id: ctx.business.id, actor_id: ctx.userId, action: "password_changed", data: { channel: verified.channel ?? "sms" } });

  if (ctx.business.login_email && ctx.business.login_email_verified_at) {
    try { await d.email(ctx.business.login_email, "Your EpicMKT password was changed", "<p>The password on your EpicMKT account was just changed.</p><p>If this was not you, reset it now from the sign-in page and contact EpicMKT support.</p>"); } catch (_) { /* notice only */ }
  }
  return json({ ok: true });
});
