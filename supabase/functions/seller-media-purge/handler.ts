import { authenticate, json, rateLimited, rateOk, readJson, wrap, type Deps } from "../_shared/seller.ts";
import { settleDeletes } from "../_shared/mediaGc.ts";

// Called by the seller site right after a photo or shop image is removed or replaced. The database has already queued the file
// (a trigger, in the same transaction as the removal); this deletes it from Cloudinary now instead of at the next cron run.
// It only ever touches the calling seller's own queued files, and the cron job remains the safety net if this call never happens.
export const sellerMediaPurge = (d: Deps) => wrap(async (req) => {
  await readJson(req);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (!d.cloudinary) return json({ error: "media_not_configured" }, 503);
  if (!(await rateOk(d.db, `media-purge:${ctx.business.id}`, 240, 3600))) return rateLimited();

  const claimed = await d.db.rpc("media_gc_claim_for_business", { p_business: ctx.business.id, p_limit: 20 });
  if (claimed.error) return json({ error: "server_error" }, 500);
  const ids: string[] = (claimed.data ?? []).map((r: { public_id: string }) => r.public_id);
  return json(await settleDeletes(d, ids));
});
