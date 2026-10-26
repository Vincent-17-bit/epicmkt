import { json, wrap, type Deps } from "../_shared/seller.ts";
import { settleDeletes } from "../_shared/mediaGc.ts";

// Run every few minutes (pg_cron + pg_net, see supabase/cron/schedule.sql) with the x-cron-secret header.
// 1. Settles uploads that were signed but never attached (the seller closed the tab mid-upload).
// 2. Deletes from Cloudinary every file nothing points at any more: removed photos, replaced logos, deleted shops.
// A file that fails to delete stays in the queue and is retried with a growing pause, so Cloudinary being down loses nothing.
export const mediaGc = (d: Deps) => wrap(async (req) => {
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!d.cronSecret || secret !== d.cronSecret) return json({ error: "unauthorized" }, 401);
  if (!d.cloudinary) return json({ error: "media_not_configured" }, 503);

  const swept = await d.db.rpc("media_sweep_orphans", {});
  if (swept.error) return json({ error: "server_error" }, 500);

  const claimed = await d.db.rpc("media_gc_claim", { p_limit: 50 });
  if (claimed.error) return json({ error: "server_error" }, 500);
  const ids: string[] = (claimed.data ?? []).map((r: { public_id: string }) => r.public_id);
  if (!ids.length) return json({ swept: swept.data ?? 0, deleted: 0, failed: 0 });

  const done = await settleDeletes(d, ids);
  return json({ swept: swept.data ?? 0, ...done });
});
