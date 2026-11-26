import { auditInsert, authenticate, codeSchema, confirmCurrentPassword, GENERIC_CODE, json, maskPhone, passwordSchema, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { phoneChanged } from "../_shared/messages.ts";

// Changes the phone number on a seller's listing. Needs BOTH the code that was texted to the new number (proof they hold it) and
// the current password (proof the person holding this session is the owner). The number saved is the one the code was issued
// for, never one taken from this request.
const Body = z.object({ code: codeSchema, currentPassword: passwordSchema });

export const sellerSetPhone = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const b = ctx.business;
  if (!(await rateOk(d.db, `ssp:${b.id}`, 20, 3600))) return rateLimited();

  // The current password counts against the same lockout as signing in, so this cannot be used to guess it.
  const wrongPassword = await confirmCurrentPassword(d, b, parsed.data.currentPassword);
  if (wrongPassword) return wrongPassword;

  const verified = (await d.db.rpc("seller_otp_verify", { p_business: b.id, p_purpose: "verify_phone", p_code: parsed.data.code })).data;
  if (!verified?.ok || !verified.target) return json({ error: "invalid_code", message: GENERIC_CODE }, 400);

  const saved = await d.db.rpc("seller_set_verified_phone", { p_business: b.id, p_phone: String(verified.target) });
  const result = saved?.data;
  if (saved?.error || !result) return json({ error: "server_error" }, 500);
  if (!result.ok) {
    if (result.reason === "no_change") return json({ error: "no_change", message: "That is already your number." }, 409);
    if (result.reason === "invalid_phone") return json({ error: "invalid_phone" }, 400);
    return json({ error: "server_error" }, 500);
  }
  const phone = String(result.phone);
  const previous = String(result.previous ?? b.phone);
  await auditInsert(d.db, { business_id: b.id, actor_id: ctx.userId, action: "phone_changed", data: { phone: maskPhone(phone), previous: maskPhone(previous), cancelledRequests: result.cancelledRequests ?? 0 } });

  // Tell the OLD number, and the verified email if there is one, so a takeover cannot go unnoticed. Best effort.
  const n = phoneChanged(maskPhone(phone));
  try { await d.sms(previous, n.sms); } catch (_) { /* notice only */ }
  if (b.login_email && b.login_email_verified_at) {
    try { await d.email(b.login_email, n.subject, emailHtml(n.text)); } catch (_) { /* notice only */ }
  }
  return json({ ok: true, phone });
});
