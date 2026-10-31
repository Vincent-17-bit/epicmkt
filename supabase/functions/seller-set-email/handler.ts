import { auditInsert, authenticate, codeSchema, GENERIC_AUTH, GENERIC_CODE, json, maskEmail, passwordSchema, rateLimited, rateOk, readJson, sellerEmail, wrap, z, type Deps } from "../_shared/seller.ts";
import { emailHtml } from "../_shared/emailTemplate.ts";
import { signInEmailChanged } from "../_shared/messages.ts";

// Adds or changes the email a seller can sign in with. Needs BOTH the code that was sent to the new address (proof the
// address is theirs) and the current password (proof the person holding this session is the owner). The address saved is
// the one the code was issued for, never one taken from this request.
const Body = z.object({ code: codeSchema, currentPassword: passwordSchema });

const isDuplicate = (e: any) => e?.code === "23505" || /duplicate key/i.test(e?.message ?? "");

export const sellerSetEmail = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const b = ctx.business;
  if (!(await rateOk(d.db, `sse:${b.id}`, 20, 3600))) return rateLimited();

  // The current password counts against the same lockout as signing in, so this cannot be used to guess it.
  const lockKey = `sid:${b.seller_id.toLowerCase()}`;
  const locked = (await d.db.rpc("auth_lock_remaining", { p_key: lockKey })).data as number;
  if (locked > 0) return json({ error: "locked", message: GENERIC_AUTH, retryAfter: locked }, 429);
  const { data: signedIn, error: pwError } = await d.anon.auth.signInWithPassword({ email: sellerEmail(b.seller_id), password: parsed.data.currentPassword });
  if (pwError || !signedIn?.session) {
    await d.db.rpc("auth_record_failure", { p_key: lockKey, p_max: 5, p_lock_seconds: 900 });
    return json({ error: "invalid_password", message: "That is not your current password." }, 401);
  }
  await d.db.rpc("auth_clear", { p_key: lockKey });

  const verified = (await d.db.rpc("seller_otp_verify", { p_business: b.id, p_purpose: "verify_email", p_code: parsed.data.code })).data;
  if (!verified?.ok || !verified.target) return json({ error: "invalid_code", message: GENERIC_CODE }, 400);
  const email = String(verified.target).toLowerCase();
  const previous = b.login_email; // read before saving, so the old address can be told

  const saved = await d.db.from("businesses").update({ login_email: email, login_email_verified_at: new Date().toISOString() }).eq("id", b.id);
  if (saved?.error) return isDuplicate(saved.error) ? json({ error: "email_in_use" }, 409) : json({ error: "server_error" }, 500);
  await auditInsert(d.db, { business_id: b.id, actor_id: ctx.userId, action: "login_email_set", data: { email: maskEmail(email), changed: !!previous } });

  // Tell the old address its sign-in email was changed, so a takeover cannot go unnoticed. Best effort.
  if (previous && previous !== email) {
    try { const n = signInEmailChanged(maskEmail(email)); await d.email(previous, n.subject, emailHtml(n.text)); } catch (_) { /* notice only */ }
  }
  return json({ ok: true, loginEmail: email });
});
