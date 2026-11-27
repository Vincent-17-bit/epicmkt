import { authenticate, channelSchema, confirmCurrentPassword, emailSchema, hashIp, json, phoneSchema, maskEmail, maskPhone, passwordSchema, rateLimited, rateOk, readJson, sendOtp, wrap, z, type Deps } from "../_shared/seller.ts";

// change_password: a code to confirm a password change, sent by SMS (the phone on the listing) or to the verified email.
// verify_email: a code sent to a NEW address to prove it belongs to the seller (always email, the address is in the body).
//   The current password may come with it, so a wrong password is caught before the code is spent (set-email still checks it).
// verify_phone: a code sent by SMS to a NEW number to prove the seller holds it. The current password is required here, before any
//   SMS is sent, so a stolen session cannot be used to text codes to other people's phones.
const Body = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("change_password"), channel: channelSchema.default("sms") }),
  z.object({ purpose: z.literal("verify_email"), email: emailSchema, currentPassword: passwordSchema.optional() }),
  z.object({ purpose: z.literal("verify_phone"), phone: phoneSchema, currentPassword: passwordSchema }),
]);

export const sellerOtpRequest = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  if (!(await rateOk(d.db, `sotp:ip:${await hashIp(req, d.salt)}`, 30, 3600))) return rateLimited();
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const b = ctx.business;

  let channel: "sms" | "email" = "sms";
  let email: string | null = null;
  let phone: string = b.phone; // where an SMS goes: the listing's number, except for verify_phone (the new number)
  let target: string | null = null;
  if (parsed.data.purpose === "verify_email") {
    channel = "email";
    email = target = parsed.data.email;
    if (parsed.data.currentPassword !== undefined) {
      const wrongPassword = await confirmCurrentPassword(d, b, parsed.data.currentPassword);
      if (wrongPassword) return wrongPassword;
    }
    const taken = (await d.db.from("businesses").select("id").eq("login_email", email).neq("id", b.id).neq("status", "deleted").maybeSingle()).data;
    if (taken) return json({ error: "email_in_use" }, 409);
  } else if (parsed.data.purpose === "verify_phone") {
    const wrongPassword = await confirmCurrentPassword(d, b, parsed.data.currentPassword);
    if (wrongPassword) return wrongPassword;
    if (parsed.data.phone === b.phone) return json({ error: "no_change", message: "That is already your number." }, 409);
    phone = target = parsed.data.phone;
  } else if (parsed.data.channel === "email") {
    // Only an address the seller already proved is theirs can receive a password code.
    if (!b.login_email || !b.login_email_verified_at) return json({ error: "email_not_verified" }, 409);
    channel = "email";
    email = b.login_email;
  }

  const code = d.code();
  const issued = (await d.db.rpc("seller_otp_issue", { p_business: b.id, p_purpose: parsed.data.purpose, p_code: code, p_channel: channel, p_target: target })).data;
  if (!issued?.ok) return rateLimited(issued?.retry_after ?? 60);
  if (!(await sendOtp(d, channel, { phone, email }, code))) {
    // The text or email never left, so nobody holds this code. Take it back: otherwise it would count against the resend wait and the
    // hourly limit, and the seller would be told "too many tries" after a failure that was not theirs.
    try { await d.db.from("seller_otps").delete().eq("business_id", b.id).eq("purpose", parsed.data.purpose).eq("used", false); } catch (_) { /* the code expires on its own in 10 minutes */ }
    return json({ error: "send_failed" }, 502);
  }
  return json({ ok: true, channel, sentTo: channel === "email" ? maskEmail(email!) : maskPhone(phone) });
});
