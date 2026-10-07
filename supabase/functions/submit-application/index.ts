import { createClient } from "npm:@supabase/supabase-js@2";
import { ALLOWED_EXT, MAX_FILES, SLOT_LIMITS, allowedSlots, applicationSchema, requiredSlots } from "../_shared/validate.ts";
import { withCors, clientIp, corsHeaders, json, randomToken, sha256Hex, verifyTurnstile } from "../_shared/http.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const ip = clientIp(req);
  const ipHash = await sha256Hex((Deno.env.get("IP_HASH_SALT") ?? "") + ip);

  if (typeof body.hp === "string" && body.hp.length > 0)
    return json({ ok: true, applicationId: crypto.randomUUID(), finalizeToken: "x", uploads: [] });
  if (!Number.isFinite(body.startedAt) || Date.now() - body.startedAt < 20_000)
    return json({ error: "too_fast" }, 400);
  if (!(await verifyTurnstile(body.turnstileToken, ip))) return json({ error: "captcha_failed" }, 400);

  const ipOk = await db.rpc("hit_rate_limit", { p_key: `submit:ip:${ipHash}`, p_max: 5, p_window_seconds: 3600 });
  if (ipOk.data !== true) return json({ error: "rate_limited" }, 429);

  const parsed = applicationSchema.safeParse(body.payload);
  if (!parsed.success)
    return json({ error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 422);
  const p = parsed.data;

  const phoneOk = await db.rpc("hit_rate_limit", { p_key: `submit:phone:${p.phone}`, p_max: 3, p_window_seconds: 86400 });
  if (phoneOk.data !== true) return json({ error: "rate_limited" }, 429);

  const { data: cat } = await db.from("categories").select("id, extra_docs").eq("id", p.categoryId).eq("active", true).maybeSingle();
  if (!cat) return json({ error: "unknown_category" }, 422);
  const { data: plan } = await db.from("plans")
    .select("price_kes, items_limit, top_benefits, features, badge")
    .eq("category_id", p.categoryId).eq("plan_key", p.planKey).maybeSingle();
  if (!plan) return json({ error: "unknown_plan" }, 422);
  const { data: legal } = await db.from("legal_docs").select("key, version");
  const ver = Object.fromEntries((legal ?? []).map((d: any) => [d.key, d.version]));
  if (ver.terms !== p.termsVersion || ver.privacy !== p.privacyVersion)
    return json({ error: "legal_version_changed" }, 409);

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0 || files.length > MAX_FILES) return json({ error: "invalid_files" }, 422);
  const allowed = new Set(allowedSlots(cat as any));
  const required = requiredSlots(cat as any, {
    ownerIdType: p.owner.idType, registered: p.business.registered, conditionalDocs: p.conditionalDocs,
  });
  const seen = new Set<string>();
  const exts: Record<string, string> = {};
  for (const f of files) {
    const ext = String(f?.name ?? "").split(".").pop()?.toLowerCase() ?? "";
    const limit = f?.mime === "application/pdf" ? SLOT_LIMITS.pdf : SLOT_LIMITS.image;
    const okType = ALLOWED_EXT[f?.mime]?.includes(ext);
    if (!allowed.has(f?.slot) || seen.has(f.slot) || !okType || !(f.size > 0 && f.size <= limit))
      return json({ error: "invalid_file", slot: f?.slot }, 422);
    seen.add(f.slot);
    exts[f.slot] = ext === "jpeg" ? "jpg" : ext;
  }
  const missing = required.filter((s) => !seen.has(s));
  if (missing.length) return json({ error: "missing_documents", slots: missing }, 422);

  const finalizeToken = randomToken();
  const { data: app, error } = await db.from("applications").insert({
    status: "uploading",
    category_id: cat.id,
    plan_key: p.planKey,
    price_at_submission: plan.price_kes,
    plan_snapshot: plan,
    owner_full_name: p.owner.fullName,
    owner_id_type: p.owner.idType,
    owner_id_number: p.owner.idNumber,
    phone: p.phone,
    alt_phone: p.altPhone ?? null,
    email: p.email,
    business_name: p.business.name,
    registered: p.business.registered,
    reg_type: p.business.regType ?? null,
    reg_number: p.business.regNumber ?? null,
    year_established: p.business.yearEstablished,
    kra_pin: p.business.kraPin ?? null,
    sbp_number: p.business.sbpNumber,
    sbp_expiry: p.business.sbpExpiry,
    short_description: p.business.shortDescription ?? null,
    template_values: p.templateValues,
    conditional_docs: p.conditionalDocs,
    county: p.location.county,
    town: p.location.town,
    address: p.location.address,
    lat: p.location.lat,
    lng: p.location.lng,
    business_phones: p.contacts.businessPhones,
    whatsapp: p.contacts.whatsapp,
    website: p.contacts.website ?? null,
    socials: p.contacts.socials,
    terms_version: p.termsVersion,
    privacy_version: p.privacyVersion,
    authorised: true,
    finalize_token_hash: await sha256Hex(finalizeToken),
    ip_hash: ipHash,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200),
  }).select("id").single();
  if (error || !app) return json({ error: "server_error" }, 500);

  const uploads: { slot: string; path: string; token: string }[] = [];
  const rows: any[] = [];
  for (const f of files) {
    const path = `${app.id}/${crypto.randomUUID()}.${exts[f.slot]}`;
    const { data, error: signErr } = await db.storage.from("applications").createSignedUploadUrl(path);
    if (signErr || !data) {
      await db.from("applications").delete().eq("id", app.id);
      return json({ error: "server_error" }, 500);
    }
    uploads.push({ slot: f.slot, path, token: data.token });
    rows.push({
      application_id: app.id, slot_key: f.slot, storage_path: path,
      original_name: String(f.name).replace(/[^\w.\- ]/g, "_").slice(0, 120), mime: f.mime, size_bytes: f.size,
    });
  }
  const ins = await db.from("application_documents").insert(rows);
  if (ins.error) {
    await db.from("applications").delete().eq("id", app.id);
    return json({ error: "server_error" }, 500);
  }

  return json({ ok: true, applicationId: app.id, finalizeToken, uploads });
}));
