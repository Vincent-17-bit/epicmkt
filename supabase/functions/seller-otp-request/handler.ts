import { authenticate, hashIp, json, maskPhone, rateLimited, rateOk, readJson, recoveryEmail, wrap, z, type Deps } from "../_shared/seller.ts";
import { dispatchOtp, maskEmail } from "../_shared/otpDelivery.ts";

const Body = z.object({ purpose: z.literal("change_password"), channel: z.enum(["sms", "email"]).optional() });

export const sellerOtpRequest = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  if (!(await rateOk(d.db, `sotp:ip:${await hashIp(req, d.salt)}`, 30, 3600))) return rateLimited();
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;

  const email = await recoveryEmail(d.db, ctx.business.application_id);
  const channel = parsed.data.channel ?? "sms";
  if (channel === "email" && !email) return json({ error: "email_unavailable" }, 409);

  const code = d.code();
  const issued = (await d.db.rpc("seller_otp_issue", { p_business: ctx.business.id, p_purpose: parsed.data.purpose, p_code: code })).data;
  if (!issued?.ok) return rateLimited(issued?.retry_after ?? 60);
  const sent = await dispatchOtp(d, { phone: ctx.business.phone, email }, code, channel);
  if (!sent.channel) return json({ error: "delivery_failed", canUseEmail: !!email && channel === "sms" }, 502);
  return json({
    ok: true,
    channel: sent.channel,
    fellBack: sent.fellBack,
    sentTo: sent.channel === "email" ? maskEmail(email!) : maskPhone(ctx.business.phone),
    canUseEmail: !!email,
  });
});
