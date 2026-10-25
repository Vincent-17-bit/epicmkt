import { authenticate, channelSchema, emailSchema, hashIp, json, maskEmail, maskPhone, rateLimited, rateOk, readJson, sendOtp, wrap, z, type Deps } from "../_shared/seller.ts";

// change_password: a code to confirm a password change, sent by SMS (the phone on the listing) or to the verified email.
// verify_email: a code sent to a NEW address to prove it belongs to the seller (always email, the address is in the body).
const Body = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("change_password"), channel: channelSchema.default("sms") }),
  z.object({ purpose: z.literal("verify_email"), email: emailSchema }),
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
  let target: string | null = null;
  if (parsed.data.purpose === "verify_email") {
    channel = "email";
    email = target = parsed.data.email;
    const taken = (await d.db.from("businesses").select("id").eq("login_email", email).neq("id", b.id).neq("status", "deleted").maybeSingle()).data;
    if (taken) return json({ error: "email_in_use" }, 409);
  } else if (parsed.data.channel === "email") {
    // Only an address the seller already proved is theirs can receive a password code.
    if (!b.login_email || !b.login_email_verified_at) return json({ error: "email_not_verified" }, 409);
    channel = "email";
    email = b.login_email;
  }

  const code = d.code();
  const issued = (await d.db.rpc("seller_otp_issue", { p_business: b.id, p_purpose: parsed.data.purpose, p_code: code, p_channel: channel, p_target: target })).data;
  if (!issued?.ok) return rateLimited(issued?.retry_after ?? 60);
  if (!(await sendOtp(d, channel, { phone: b.phone, email }, code))) return json({ error: "send_failed" }, 502);
  return json({ ok: true, channel, sentTo: channel === "email" ? maskEmail(email!) : maskPhone(b.phone) });
});
