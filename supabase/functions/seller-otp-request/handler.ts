import { authenticate, hashIp, json, maskPhone, otpMessage, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({ purpose: z.literal("change_password") });

export const sellerOtpRequest = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  if (!(await rateOk(d.db, `sotp:ip:${await hashIp(req, d.salt)}`, 30, 3600))) return rateLimited();
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;

  const code = d.code();
  const issued = (await d.db.rpc("seller_otp_issue", { p_business: ctx.business.id, p_purpose: parsed.data.purpose, p_code: code })).data;
  if (!issued?.ok) return rateLimited(issued?.retry_after ?? 60);
  await d.sms(ctx.business.phone, otpMessage(code));
  return json({ ok: true, sentTo: maskPhone(ctx.business.phone) });
});
