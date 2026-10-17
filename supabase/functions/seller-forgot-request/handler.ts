import { hashIp, json, rateLimited, rateOk, readJson, recoveryEmail, sellerIdSchema, wrap, z, type Deps } from "../_shared/seller.ts";
import { dispatchOtp } from "../_shared/otpDelivery.ts";

const Body = z.object({ sellerId: sellerIdSchema, channel: z.enum(["sms", "email"]).optional() });
const GENERIC = {
  ok: true,
  message: "If this Seller ID exists, we have sent a code to the phone number on the listing, or to the email on the application if the SMS cannot be delivered.",
};
const GENERIC_EMAIL = { ok: true, message: "If this Seller ID exists, we have sent a code to the email on the application." };

export const sellerForgotRequest = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json(GENERIC);
  const sid = parsed.data.sellerId.toUpperCase();
  const channel = parsed.data.channel ?? "sms";
  const reply = channel === "email" ? GENERIC_EMAIL : GENERIC;
  const ipHash = await hashIp(req, d.salt);
  if (!(await rateOk(d.db, `sfp:resend:${sid}`, 1, 60))) return rateLimited(60);
  if (!(await rateOk(d.db, `sfp:hour:${sid}`, 5, 3600)) || !(await rateOk(d.db, `sfp:ip:${ipHash}`, 20, 3600))) return rateLimited();

  const { data: business } = await d.db.from("businesses").select("id, phone, status, user_id, application_id").eq("seller_id", sid).maybeSingle();
  if (!business || business.status === "deleted" || !business.user_id) return json(reply);

  const code = d.code();
  const issued = (await d.db.rpc("seller_otp_issue", { p_business: business.id, p_purpose: "forgot_password", p_code: code })).data;
  if (issued?.ok) {
    const email = await recoveryEmail(d.db, business.application_id);
    await dispatchOtp(d, { phone: business.phone, email }, code, channel);
  }
  return json(reply);
});
