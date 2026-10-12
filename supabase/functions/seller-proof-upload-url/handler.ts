import { PROOF_MAX_BYTES, PROOF_MAX_FILES, PROOF_TYPES } from "../_shared/files.ts";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

export const BUCKET = "seller-proofs";

const Body = z.object({
  flagId: z.string().uuid(),
  files: z.array(z.object({ name: z.string().min(1).max(300), size: z.number().int().min(1), type: z.string().max(100) })).min(1).max(PROOF_MAX_FILES),
});

export const cleanName = (raw: string) => {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean || "file";
};

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

// Step 1 of 3. Checks ownership, the open flag and the limits, then hands out ONE-TIME signed upload URLs
// with random object names. The seller never chooses a path and never reads anything back.
export const sellerProofUploadUrl = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!(await rateOk(d.db, `proof-url:${ctx.business.id}`, 30, 3600))) return rateLimited();
  const { flagId, files } = parsed.data;

  const flag = await d.db.from("flags").select("id, business_id, status, seller_message").eq("id", flagId).maybeSingle();
  if (!flag.data || flag.data.business_id !== ctx.business.id || !flag.data.seller_message) return json({ error: "flag_not_found" }, 404);
  if (flag.data.status !== "open") return json({ error: "flag_not_open" }, 409);

  const kinds = Object.values(PROOF_TYPES);
  for (const f of files) {
    const kind = kinds.find((k) => k.mime === f.type);
    if (!kind || !kind.ext.includes(extOf(f.name))) return json({ error: "type_not_allowed", file: cleanName(f.name) }, 422);
    if (f.size > PROOF_MAX_BYTES) return json({ error: "file_too_large", file: cleanName(f.name) }, 422);
  }

  const store = d.db.storage.from(BUCKET);
  // A new attempt replaces earlier uploads that were never finalized.
  const stale = await d.db.from("flag_attachments").select("id, path").eq("flag_id", flagId).eq("status", "pending");
  const old = stale.data ?? [];
  if (old.length) {
    try { await store.remove(old.map((r: any) => r.path)); } catch { /* the purge job retries */ }
    await d.db.from("flag_attachments").delete().in("id", old.map((r: any) => r.id));
  }
  const existing = await d.db.from("flag_attachments").select("id").eq("flag_id", flagId);
  if ((existing.data ?? []).length + files.length > PROOF_MAX_FILES) return json({ error: "attachments_limit" }, 409);

  const uploads: unknown[] = [];
  const made: { id: string; path: string }[] = [];
  const undo = async () => {
    try { await store.remove(made.map((m) => m.path)); } catch { /* purge job */ }
    if (made.length) await d.db.from("flag_attachments").delete().in("id", made.map((m) => m.id));
  };
  for (const f of files) {
    const kind = kinds.find((k) => k.mime === f.type)!;
    const id = crypto.randomUUID();
    const path = `${ctx.business.id}/${flagId}/${crypto.randomUUID()}.${kind.ext[0]}`;
    const signed = await store.createSignedUploadUrl(path);
    if (signed.error || !signed.data) { await undo(); return json({ error: "server_error" }, 500); }
    const ins = await d.db.from("flag_attachments").insert({
      id, flag_id: flagId, business_id: ctx.business.id, path, original_name: cleanName(f.name), mime: kind.mime, size_bytes: f.size, status: "pending",
    });
    if (ins.error) { await undo(); return json({ error: /attachments_limit/.test(ins.error.message ?? "") ? "attachments_limit" : "server_error" }, /attachments_limit/.test(ins.error.message ?? "") ? 409 : 500); }
    made.push({ id, path });
    uploads.push({ attachmentId: id, path, token: signed.data.token, signedUrl: signed.data.signedUrl });
  }
  return json({ uploads }, 201);
});
