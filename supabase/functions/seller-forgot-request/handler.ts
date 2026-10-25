import { channelSchema, findSeller, hashIp, identifierSchema, json, rateLimited, rateOk, readJson, sendOtp, wrap, z, type Deps } from "../_shared/seller.ts";

// `identifier` is a Seller ID or the seller's verified email (`sellerId` is the older field name). `channel` is where the
// code goes: "sms" to the phone on the listing (the default) or "email" to the verified sign-in email.
const Body = z.object({ identifier: identifierSchema.optional(), sellerId: identifierSchema.optional(), channel: channelSchema.default("sms") })
  .refine((v) => !!(v.identifier ?? v.sellerId));

// The same answer for every request, so nobody can use this to find out which IDs, emails or channels exist.
const GENERIC = { ok: true, message: "If we found an account, we have sent a code. Email codes only work once you have added and verified your email in Account." };

export const sellerForgotRequest = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json(GENERIC);
  const raw = (parsed.data.identifier ?? parsed.data.sellerId)!.trim();
  const key = raw.toLowerCase();
  const ipHash = await hashIp(req, d.salt);
  if (!(await rateOk(d.db, `sfp:resend:${key}`, 1, 60))) return rateLimited(60);
  if (!(await rateOk(d.db, `sfp:hour:${key}`, 5, 3600)) || !(await rateOk(d.db, `sfp:ip:${ipHash}`, 20, 3600))) return rateLimited();

  const business = await findSeller(d.db, raw);
  if (!business || !business.user_id) return json(GENERIC);
  const channel = parsed.data.channel;
  // Email codes go only to an address the seller has already proved is theirs.
  if (channel === "email" && (!business.login_email || !business.login_email_verified_at)) return json(GENERIC);

  const code = d.code();
  const issued = (await d.db.rpc("seller_otp_issue", { p_business: business.id, p_purpose: "forgot_password", p_code: code, p_channel: channel })).data;
  if (issued?.ok) await sendOtp(d, channel, { phone: business.phone, email: business.login_email }, code);
  return json(GENERIC);
});
