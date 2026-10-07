import { createClient } from "npm:@supabase/supabase-js@2";
import { MIME_BY_KIND, SLOT_LIMITS, requiredSlots } from "../_shared/validate.ts";
import { pdfIsSafe, sniff } from "../_shared/files.ts";
import { withCors, clientIp, corsHeaders, escapeHtml, json, sendMail, sha256Hex } from "../_shared/http.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function abort(appId: string, paths: string[]) {
  if (paths.length) await db.storage.from("applications").remove(paths);
  await db.from("applications").delete().eq("id", appId);
}

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const ip = clientIp(req);
  const ipHash = await sha256Hex((Deno.env.get("IP_HASH_SALT") ?? "") + ip);
  const ok = await db.rpc("hit_rate_limit", { p_key: `finalize:ip:${ipHash}`, p_max: 20, p_window_seconds: 3600 });
  if (ok.data !== true) return json({ error: "rate_limited" }, 429);

  const { applicationId, finalizeToken } = body ?? {};
  if (typeof applicationId !== "string" || typeof finalizeToken !== "string") return json({ error: "bad_request" }, 400);

  const { data: app } = await db.from("applications").select("*").eq("id", applicationId).eq("status", "uploading").maybeSingle();
  if (!app || app.finalize_token_hash !== (await sha256Hex(finalizeToken))) return json({ error: "not_found" }, 404);

  const { data: docs } = await db.from("application_documents").select("*").eq("application_id", app.id);
  const { data: cat } = await db.from("categories").select("id, name, extra_docs").eq("id", app.category_id).single();
  const paths = (docs ?? []).map((d: any) => d.storage_path);

  const bad: { slot: string; reason: string }[] = [];
  for (const d of docs ?? []) {
    const { data: blob, error } = await db.storage.from("applications").download(d.storage_path);
    if (error || !blob) { bad.push({ slot: d.slot_key, reason: "not_uploaded" }); continue; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const kind = sniff(bytes);
    const limit = kind === "pdf" ? SLOT_LIMITS.pdf : SLOT_LIMITS.image;
    if (!kind || bytes.length === 0 || bytes.length > limit || MIME_BY_KIND[kind] !== d.mime) {
      bad.push({ slot: d.slot_key, reason: "wrong_type_or_size" });
    } else if (kind === "pdf" && !pdfIsSafe(bytes)) {
      bad.push({ slot: d.slot_key, reason: "unsafe_pdf" });
    } else {
      await db.from("application_documents").update({ size_bytes: bytes.length, verified: true }).eq("id", d.id);
    }
  }

  const required = requiredSlots(cat as any, {
    ownerIdType: app.owner_id_type, registered: app.registered, conditionalDocs: app.conditional_docs,
  });
  const have = new Set((docs ?? []).filter((d: any) => !bad.some((b) => b.slot === d.slot_key)).map((d: any) => d.slot_key));
  for (const s of required) if (!have.has(s) && !bad.some((b) => b.slot === s)) bad.push({ slot: s, reason: "missing" });

  if (bad.length) {
    await abort(app.id, paths);
    return json({ ok: false, error: "file_rejected", files: bad }, 422);
  }

  const { error: upErr } = await db.from("applications").update({
    status: "submitted",
    submitted_at: new Date().toISOString(),
    completeness_hint: app.registered ? "complete" : "basic",
    finalize_token_hash: null,
  }).eq("id", app.id);
  if (upErr) return json({ error: "server_error" }, 500);
  await db.from("application_events").insert({ application_id: app.id, actor: "system", type: "submitted", data: {} });

  const ref = escapeHtml(app.reference_no);
  await sendMail(
    Deno.env.get("ADMIN_EMAIL"),
    `New seller application ${app.reference_no}`,
    `<p><b>${escapeHtml(app.business_name)}</b> (${escapeHtml(cat?.name)})</p>
     <p>Owner: ${escapeHtml(app.owner_full_name)}<br>Phone: ${escapeHtml(app.phone)}<br>Plan: ${escapeHtml(app.plan_key)} at KES ${escapeHtml(app.price_at_submission)}</p>
     <p>Reference: ${ref}</p>`,
  );
  await sendMail(
    app.email,
    "We received your EpicMKT seller application",
    `<p>Thank you, ${escapeHtml(app.owner_full_name)}.</p>
     <p>Your reference number is <b>${ref}</b>. Keep it safe: you will use it with your phone number to check your application.</p>`,
  );

  return json({ ok: true, referenceNo: app.reference_no });
}));
