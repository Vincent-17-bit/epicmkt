import { GENERIC_AUTH, hashIp, json, passwordSchema, rateLimited, rateOk, readJson, sellerEmail, sellerIdSchema, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({ sellerId: sellerIdSchema, password: passwordSchema });

const failure = (locked: number) =>
  locked > 0
    ? json({ error: "locked", message: GENERIC_AUTH, retryAfter: locked }, 429)
    : json({ error: "invalid_credentials", message: GENERIC_AUTH }, 401);

export const sellerLogin = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const sid = parsed.data.sellerId.toUpperCase();
  const key = `sid:${sid.toLowerCase()}`;
  const ipHash = await hashIp(req, d.salt);
  if (!(await rateOk(d.db, `login:ip:${ipHash}`, 60, 3600))) return rateLimited();

  const locked = (await d.db.rpc("auth_lock_remaining", { p_key: key })).data as number;
  if (locked > 0) return failure(locked);

  const { data: business } = await d.db.from("businesses").select("id, status").eq("seller_id", sid).maybeSingle();
  const known = !!business && business.status !== "deleted";
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
