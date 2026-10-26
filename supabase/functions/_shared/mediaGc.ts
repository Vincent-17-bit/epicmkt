import type { Deps } from "./seller.ts";

// Deletes the given Cloudinary files and records the outcome in the queue: deleted files leave it, failed ones are retried later
// with a growing pause. Shared by the cron job (media-gc) and the seller's own "delete my removed photos now" call.
export async function settleDeletes(d: Deps, ids: string[]) {
  if (!d.cloudinary || !ids.length) return { deleted: 0, failed: 0 };
  const result = await d.cloudinary.destroy(ids);
  if (result.deleted.length) await d.db.rpc("media_gc_done", { p_ids: result.deleted });
  if (result.failed.length) await d.db.rpc("media_gc_fail", { p_ids: result.failed.map((f) => f.id), p_error: result.failed[0].reason });
  return { deleted: result.deleted.length, failed: result.failed.length };
}
