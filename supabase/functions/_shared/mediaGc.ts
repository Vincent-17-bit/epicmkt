import type { Deps } from "./seller.ts";

const BUCKET = "seller-media";
// A video is a file in the Supabase bucket (its path ends in an extension); every other queued id is a Cloudinary public id.
const isStorageVideo = (id: string) => /\.(mp4|webm)$/i.test(id);

// Deletes the given files and records the outcome in the queue: deleted files leave it, failed ones are retried later with a growing
// pause. Cloudinary ids go to Cloudinary, video paths to the bucket. Shared by the cron job (media-gc) and the seller's own
// "delete my removed photos now" call.
export async function settleDeletes(d: Deps, ids: string[]) {
  const stored = ids.filter(isStorageVideo);
  const hosted = ids.filter((id) => !isStorageVideo(id));
  let deleted = 0;
  let failed = 0;

  if (stored.length) {
    let reason = "";
    try {
      const res = await d.db.storage.from(BUCKET).remove(stored);
      if (res.error) reason = String(res.error.message ?? "storage error");
    } catch (e) {
      reason = String((e as Error)?.message ?? e);
    }
    if (reason) {
      await d.db.rpc("media_gc_fail", { p_ids: stored, p_error: reason });
      failed += stored.length;
    } else {
      await d.db.rpc("media_gc_done", { p_ids: stored });
      deleted += stored.length;
    }
  }

  if (d.cloudinary && hosted.length) {
    const result = await d.cloudinary.destroy(hosted);
    if (result.deleted.length) await d.db.rpc("media_gc_done", { p_ids: result.deleted });
    if (result.failed.length) await d.db.rpc("media_gc_fail", { p_ids: result.failed.map((f) => f.id), p_error: result.failed[0].reason });
    deleted += result.deleted.length;
    failed += result.failed.length;
  }
  return { deleted, failed };
}
