import { authenticateAdmin, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({ attachmentId: z.string().uuid() });
export const PROOF_URL_SECONDS = 60;

// Admins open a proof through a 60 second signed URL, and every opening is written to the audit log first.
export const adminProofUrl = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticateAdmin(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!(await rateOk(d.db, `proof-view:${ctx.userId}`, 120, 3600))) return rateLimited();

  const row = await d.db.from("flag_attachments").select("id, flag_id, business_id, path, original_name, mime, size_bytes, status").eq("id", parsed.data.attachmentId).maybeSingle();
  if (!row.data || row.data.status !== "ready") return json({ error: "not_found" }, 404);

  const audit = await d.db.from("audit_log").insert({
    business_id: row.data.business_id, actor_id: ctx.userId, actor_role: "admin", action: "proof_viewed",
    entity: "flag_attachment", entity_id: row.data.id, data: { flag_id: row.data.flag_id, seconds: PROOF_URL_SECONDS },
  });
  if (audit.error) return json({ error: "server_error" }, 500);

  const signed = await d.db.storage.from("seller-proofs").createSignedUrl(row.data.path, PROOF_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return json({ error: "server_error" }, 500);
  return json({ url: signed.data.signedUrl, expiresIn: PROOF_URL_SECONDS, name: row.data.original_name, mime: row.data.mime, size: row.data.size_bytes });
});
