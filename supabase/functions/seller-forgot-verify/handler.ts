import { passwordProblems } from "../_shared/synced/password.js";
import { auditInsert, codeSchema, findSeller, GENERIC_CODE, hashIp, identifierSchema, json, passwordSchema, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({ identifier: identifierSchema.optional(), sellerId: identifierSchema.optional(), code: codeSchema, newPassword: passwordSchema })
  .refine((v) => !!(v.identifier ?? v.sellerId));
const invalid = () => json({ error: "invalid_code", message: GENERIC_CODE }, 400);

export const sellerForgotVerify = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const { code, newPassword } = parsed.data;
  const raw = (parsed.data.identifier ?? parsed.data.sellerId)!.trim();
  const key = raw.toLowerCase();
  const ipHash = await hashIp(req, d.salt);
  if (!(await rateOk(d.db, `sfv:sid:${key}`, 20, 3600)) || !(await rateOk(d.db, `sfv:ip:${ipHash}`, 30, 3600))) return rateLimited();

  const business = await findSeller(d.db, raw);
  const known = !!business && !!business.user_id;

  const problems = passwordProblems(newPassword, { sellerId: known ? business.seller_id : raw.toUpperCase(), phone: known ? business.phone : undefined });
  if (problems.length) return json({ error: "weak_password", problems }, 422);
  if (!business || !business.user_id) return invalid();
  const userId = business.user_id;

  const verified = (await d.db.rpc("seller_otp_verify", { p_business: business.id, p_purpose: "forgot_password", p_code: code })).data;
  if (!verified?.ok) return invalid();

  const updated = await d.db.auth.admin.updateUserById(userId, { password: newPassword, user_metadata: { must_change_password: false } });
  if (updated.error) return json({ error: "server_error" }, 500);
  // Saved on the business too, so the portal knows the seller now has a password they chose themselves.
  const saved = await d.db.from("businesses").update({ must_change_password: false, password_changed_at: new Date().toISOString() }).eq("id", business.id);
  if (saved?.error) return json({ error: "server_error" }, 500);
  await d.db.rpc("revoke_user_sessions", { p_user: userId, p_keep: null });
  await auditInsert(d.db, { business_id: business.id, actor_id: userId, action: "password_reset", data: { channel: verified.channel ?? "sms" } });
  return json({ ok: true });
});
