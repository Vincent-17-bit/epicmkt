import { passwordProblems } from "../_shared/synced/password.js";
import { auditInsert, codeSchema, GENERIC_CODE, hashIp, json, passwordSchema, rateLimited, rateOk, readJson, sellerIdSchema, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({ sellerId: sellerIdSchema, code: codeSchema, newPassword: passwordSchema });
const invalid = () => json({ error: "invalid_code", message: GENERIC_CODE }, 400);

export const sellerForgotVerify = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const { code, newPassword } = parsed.data;
  const sid = parsed.data.sellerId.toUpperCase();
  const ipHash = await hashIp(req, d.salt);
  if (!(await rateOk(d.db, `sfv:sid:${sid}`, 20, 3600)) || !(await rateOk(d.db, `sfv:ip:${ipHash}`, 30, 3600))) return rateLimited();

  const { data: business } = await d.db.from("businesses").select("id, phone, status, user_id").eq("seller_id", sid).maybeSingle();
  const known = !!business && business.status !== "deleted" && !!business.user_id;

  const problems = passwordProblems(newPassword, { sellerId: sid, phone: known ? business.phone : undefined });
  if (problems.length) return json({ error: "weak_password", problems }, 422);
  if (!known) return invalid();

  const verified = (await d.db.rpc("seller_otp_verify", { p_business: business.id, p_purpose: "forgot_password", p_code: code })).data;
  if (!verified?.ok) return invalid();

  const updated = await d.db.auth.admin.updateUserById(business.user_id, { password: newPassword });
  if (updated.error) return json({ error: "server_error" }, 500);
  await d.db.rpc("revoke_user_sessions", { p_user: business.user_id, p_keep: null });
  await auditInsert(d.db, { business_id: business.id, actor_id: business.user_id, action: "password_reset" });
  return json({ ok: true });
});
