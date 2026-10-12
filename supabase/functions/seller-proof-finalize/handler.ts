import { PROOF_MAX_BYTES, PROOF_MAX_FILES, pdfProblem, sniff } from "../_shared/files.ts";
import { PROOF_TYPES } from "../_shared/files.ts";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const BUCKET = "seller-proofs";
const Body = z.object({ flagId: z.string().uuid(), attachmentIds: z.array(z.string().uuid()).min(1).max(PROOF_MAX_FILES) });

// Step 2 of 3. Re-checks every uploaded file from its real bytes. On ANY failure everything pending
// for this flag is deleted (objects and rows) so nothing unchecked is ever kept.
export const sellerProofFinalize = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!(await rateOk(d.db, `proof-finalize:${ctx.business.id}`, 30, 3600))) return rateLimited();
  const { flagId, attachmentIds } = parsed.data;

  const flag = await d.db.from("flags").select("id, business_id, status, seller_message").eq("id", flagId).maybeSingle();
  if (!flag.data || flag.data.business_id !== ctx.business.id || !flag.data.seller_message) return json({ error: "flag_not_found" }, 404);
  if (flag.data.status !== "open") return json({ error: "flag_not_open" }, 409);

  const all = await d.db.from("flag_attachments").select("*").eq("flag_id", flagId).eq("business_id", ctx.business.id).eq("status", "pending");
  const pending: any[] = all.data ?? [];
  const wanted = attachmentIds.map((id) => pending.find((r) => r.id === id));
  if (wanted.some((r) => !r)) return json({ error: "attachment_not_found" }, 404);

  const store = d.db.storage.from(BUCKET);
  const discardAll = async () => {
    try { await store.remove(pending.map((r) => r.path)); } catch { /* the purge job retries */ }
    await d.db.from("flag_attachments").delete().in("id", pending.map((r) => r.id));
  };
  const reject = async (error: string, row: any, status = 422) => {
    await discardAll();
    return json({ error, file: row.original_name }, status);
  };

  const sizes = new Map<string, number>();
  for (const row of wanted) {
    const file = await store.download(row.path);
    if (file.error || !file.data) return reject("file_not_uploaded", row);
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.length === 0 || bytes.length > PROOF_MAX_BYTES) return reject("file_too_large", row);
    const kind = sniff(bytes);
    if (!kind) return reject("type_not_allowed", row);
    if (PROOF_TYPES[kind].mime !== row.mime) return reject("type_mismatch", row);
    if (kind === "pdf") {
      const problem = pdfProblem(bytes);
      if (problem) return reject(problem, row);
    }
    sizes.set(row.id, bytes.length);
  }
  for (const row of wanted) {
    const up = await d.db.from("flag_attachments").update({ status: "ready", size_bytes: sizes.get(row.id) }).eq("id", row.id);
    if (up.error) return reject("server_error", row, 500);
  }
  return json({ attachments: wanted.map((r) => ({ id: r.id, name: r.original_name, mime: r.mime, size: sizes.get(r.id) })) }, 200);
});
