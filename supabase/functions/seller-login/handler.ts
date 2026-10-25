import { findSeller, GENERIC_AUTH, hashIp, identifierSchema, json, passwordSchema, rateLimited, rateOk, readJson, sellerEmail, wrap, z, type Deps } from "../_shared/seller.ts";

// `identifier` is a Seller ID or the seller's verified sign-in email. `sellerId` is the older field name and still works.
const Body = z.object({ identifier: identifierSchema.optional(), sellerId: identifierSchema.optional(), password: passwordSchema })
  .refine((v) => !!(v.identifier ?? v.sellerId));

const failure = (locked: number) =>
  locked > 0
    ? json({ error: "locked", message: GENERIC_AUTH, retryAfter: locked }, 429)
    : json({ error: "invalid_credentials", message: GENERIC_AUTH }, 401);

export const sellerLogin = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const raw = (parsed.data.identifier ?? parsed.data.sellerId)!.trim();
  const ipHash = await hashIp(req, d.salt);
  if (!(await rateOk(d.db, `login:ip:${ipHash}`, 60, 3600))) return rateLimited();

  // A Seller ID and the seller's email are two ways to the same account, so they share one lockout counter:
  // switching between them gives an attacker no extra guesses. A miss is counted against what was typed.
  const business = await findSeller(d.db, raw);
  const known = !!business;
  const key = `sid:${(business?.seller_id ?? raw).toLowerCase()}`;

  const locked = (await d.db.rpc("auth_lock_remaining", { p_key: key })).data as number;
  if (locked > 0) return failure(locked);

  const sid = business?.seller_id ?? raw.toUpperCase();
  const { data, error } = await d.anon.auth.signInWithPassword({
    email: sellerEmail(known ? sid : `none-${sid}`),
    password: parsed.data.password,
  });
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);

  if (error || !data?.session || !known) {
    const remaining = (await d.db.rpc("auth_record_failure", { p_key: key, p_max: 5, p_lock_seconds: 900 })).data as number;
    if (known) await d.db.from("login_events").insert({ business_id: business.id, success: false, ip_hash: ipHash, user_agent: ua });
    return failure(remaining);
  }

  await d.db.rpc("auth_clear", { p_key: key });
  await d.db.from("login_events").insert({ business_id: business.id, success: true, ip_hash: ipHash, user_agent: ua });
  const s = data.session;
  return json({ session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, expires_in: s.expires_in } });
});
