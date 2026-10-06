import { createClient } from "npm:@supabase/supabase-js@2";
import { ALLOWED_EXT, MIME_BY_KIND, SLOT_LIMITS, allowedSlots } from "../_shared/validate.ts";
import { pdfIsSafe, sniff } from "../_shared/files.ts";
import { clientIp, corsHeaders, json, sha256Hex } from "../_shared/http.ts";
import { applyPatch, columnUpdates, isDocPath, isEditablePath, sessionApp } from "../_shared/status.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function openFlags(appId: string) {
  const { data } = await db.from("application_flags").select("*").eq("application_id", appId).eq("status", "open");
  return data ?? [];
}

async function address(appId: string, paths: string[]) {
  if (!paths.length) return;
  await db.from("application_flags").update({ addressed_at: new Date().toISOString() })
    .eq("application_id", appId).eq("status", "open").in("path", paths);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const app = await sessionApp(db, sha256Hex, body?.token);
  if (!app) return json({ error: "session_expired" }, 401);
  if (app.status !== "changes_requested") return json({ error: "not_editable" }, 409);

  const ipHash = await sha256Hex((Deno.env.get("IP_HASH_SALT") ?? "") + clientIp(req));
  const lim = await db.rpc("hit_rate_limit", { p_key: `correct:${app.id}:${ipHash}`, p_max: 60, p_window_seconds: 3600 });
  if (lim.data !== true) return json({ error: "rate_limited" }, 429);

  const flags = await openFlags(app.id);
  const flagged = new Set(flags.map((f: any) => f.path));

  if (Array.isArray(body.confirm)) return await confirmUploads(app, flagged, body.confirm);

  const patch: Record<string, unknown> =
    body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? body.patch : {};
  const fileList: any[] = Array.isArray(body.files) ? body.files : [];

  for (const path of Object.keys(patch))
    if (!flagged.has(path) || !isEditablePath(path)) return json({ error: "path_not_flagged", path }, 403);

  const { data: cat } = await db.from("categories").select("id, extra_docs").eq("id", app.category_id).single();
  const allowed = new Set(allowedSlots(cat as any));
  const exts: Record<string, string> = {};
  for (const f of fileList) {
    const ext = String(f?.name ?? "").split(".").pop()?.toLowerCase() ?? "";
    const limit = f?.mime === "application/pdf" ? SLOT_LIMITS.pdf : SLOT_LIMITS.image;
    const okType = ALLOWED_EXT[f?.mime]?.includes(ext);
    if (!allowed.has(f?.slot) || !flagged.has(`documents.${f.slot}`) || !okType || !(f.size > 0 && f.size <= limit))
      return json({ error: "invalid_file", slot: f?.slot }, 422);
    exts[f.slot] = ext === "jpeg" ? "jpg" : ext;
  }

  let addressedPaths: string[] = [];
  if (Object.keys(patch).length) {
    const { issues, data } = applyPatch(app, patch);
    if (issues.length || !data) return json({ error: "invalid", issues }, 422);
    const upd = await db.from("applications").update(columnUpdates(app, patch, data)).eq("id", app.id);
    if (upd.error) return json({ error: "server_error" }, 500);
    addressedPaths = Object.keys(patch);
    await address(app.id, addressedPaths);
    await db.from("application_events").insert({ application_id: app.id, actor: "seller", type: "corrected", data: { paths: addressedPaths } });
  }

  const uploads: { slot: string; path: string; token: string }[] = [];
  for (const f of fileList) {
    const path = `${app.id}/${crypto.randomUUID()}.${exts[f.slot]}`;
    const { data, error } = await db.storage.from("applications").createSignedUploadUrl(path);
    if (error || !data) return json({ error: "server_error" }, 500);
    const row = {
      replacement_path: path,
      replacement_name: String(f.name).replace(/[^\w.\- ]/g, "_").slice(0, 120),
      replacement_mime: f.mime,
      replacement_size: f.size,
    };
    const { data: existing } = await db.from("application_documents").select("id").eq("application_id", app.id).eq("slot_key", f.slot).maybeSingle();
    if (existing) await db.from("application_documents").update(row).eq("id", existing.id);
    else
      await db.from("application_documents").insert({
        application_id: app.id, slot_key: f.slot, storage_path: path, original_name: row.replacement_name,
        mime: f.mime, size_bytes: f.size, verified: false, ...row,
      });
    uploads.push({ slot: f.slot, path, token: data.token });
  }
  return json({ ok: true, uploads, flags: (await openFlags(app.id)).length });
});

async function confirmUploads(app: any, flagged: Set<string>, slots: unknown[]) {
  const rejected: { slot: string; reason: string }[] = [];
  const okPaths: string[] = [];
  for (const slot of slots) {
    if (typeof slot !== "string" || !flagged.has(`documents.${slot}`)) { rejected.push({ slot: String(slot), reason: "not_flagged" }); continue; }
    const { data: d } = await db.from("application_documents").select("*").eq("application_id", app.id).eq("slot_key", slot).maybeSingle();
    if (!d?.replacement_path) { rejected.push({ slot, reason: "not_uploaded" }); continue; }
    const { data: blob } = await db.storage.from("applications").download(d.replacement_path);
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    const kind = bytes ? sniff(bytes) : null;
    const limit = kind === "pdf" ? SLOT_LIMITS.pdf : SLOT_LIMITS.image;
    let reason = "";
    if (!bytes) reason = "not_uploaded";
    else if (!kind || bytes.length === 0 || bytes.length > limit || MIME_BY_KIND[kind] !== d.replacement_mime) reason = "wrong_type_or_size";
    else if (kind === "pdf" && !pdfIsSafe(bytes)) reason = "unsafe_pdf";
    if (reason) {
      await db.storage.from("applications").remove([d.replacement_path]);
      await db.from("application_documents").update({ replacement_path: null, replacement_name: null, replacement_mime: null, replacement_size: null }).eq("id", d.id);
      rejected.push({ slot, reason });
      continue;
    }
    const oldPath = d.verified ? d.storage_path : null;
    await db.from("application_documents").update({
      storage_path: d.replacement_path, original_name: d.replacement_name, mime: d.replacement_mime,
      size_bytes: bytes!.length, verified: true,
      replacement_path: null, replacement_name: null, replacement_mime: null, replacement_size: null,
    }).eq("id", d.id);
    if (oldPath && oldPath !== d.replacement_path) await db.storage.from("applications").remove([oldPath]);
    okPaths.push(`documents.${slot}`);
  }
  await address(app.id, okPaths);
  if (okPaths.length)
    await db.from("application_events").insert({ application_id: app.id, actor: "seller", type: "corrected", data: { paths: okPaths } });
  if (rejected.length) return json({ ok: false, error: "file_rejected", files: rejected }, 422);
  return json({ ok: true, flags: (await openFlags(app.id)).filter((f: any) => !f.addressed_at).length });
}
