import { auditInsert, authenticate, codeSchema, confirmCurrentPassword, GENERIC_CODE, json, maskPhone, passwordSchema, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { phoneChanged } from "../_shared/messages.ts";

// Changes the phone number on a seller's listing. Needs BOTH the code that was texted to the new number (proof they hold it) and
// the current password (proof the person holding this session is the owner). The number saved is the one the code was issued
// for, never one taken from this request.
// alsoWhatsapp: use the same number for the shop's WhatsApp button too. Left off, the WhatsApp number is not touched, so a seller
// can keep one number for calls and another for WhatsApp.
const Body = z.object({ code: codeSchema, currentPassword: passwordSchema, alsoWhatsapp: z.boolean().optional() });

export const sellerSetPhone = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const b = ctx.business;
  if (b.status === "suspended") return json({ error: "account_suspended" }, 403);
  if (!(await rateOk(d.db, `ssp:${b.id}`, 20, 3600))) return rateLimited();

  // The current password counts against the same lockout as signing in, so this cannot be used to guess it.
  const wrongPassword = await confirmCurrentPassword(d, b, parsed.data.currentPassword);
  if (wrongPassword) return wrongPassword;

  const verified = (await d.db.rpc("seller_otp_verify", { p_business: b.id, p_purpose: "verify_phone", p_code: parsed.data.code })).data;
  if (!verified?.ok || !verified.target) return json({ error: "invalid_code", message: GENERIC_CODE }, 400);

  const saved = await d.db.rpc("seller_set_verified_phone", { p_business: b.id, p_phone: String(verified.target), p_also_whatsapp: parsed.data.alsoWhatsapp === true });
  const result = saved?.data;
  if (String(saved?.error?.message ?? "").includes("account_suspended")) return json({ error: "account_suspended" }, 403);
  if (saved?.error || !result) return json({ error: "server_error" }, 500);
  if (!result.ok) {
    if (result.reason === "no_change") return json({ error: "no_change", message: "That is already your number." }, 409);
    if (result.reason === "invalid_phone") return json({ error: "invalid_phone" }, 400);
    return json({ error: "server_error" }, 500);
  }
  const phone = String(result.phone);
  const previous = String(result.previous ?? b.phone);
  await auditInsert(d.db, { business_id: b.id, actor_id: ctx.userId, action: "phone_changed", data: { phone: maskPhone(phone), previous: maskPhone(previous), whatsappChanged: result.whatsappChanged === true, cancelledRequests: result.cancelledRequests ?? 0 } });

  // Tell the OLD number, and the verified email if there is one, so a takeover cannot go unnoticed. Best effort.
  const n = phoneChanged(maskPhone(phone));
  try { await d.sms(previous, n.sms); } catch (_) { /* notice only */ }
  if (b.login_email && b.login_email_verified_at) {
    try { await d.email(b.login_email, n.subject, emailHtml(n.text)); } catch (_) { /* notice only */ }
  }
  return json({ ok: true, phone, whatsappChanged: result.whatsappChanged === true });
});
