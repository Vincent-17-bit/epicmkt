import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";
import { BUCKET, ownedBy, removeObjects, rowPaths, sweepFolder } from "../_shared/media.ts";

// Removes one media ({ mediaId }) or every media of an item ({ itemId }, used when the item is deleted).
// Files go first, then rows, so a failure half way leaves rows that point at missing files, which a retry cleans up,
// and never files nobody can find.
const Body = z.union([
  z.object({ mediaId: z.string().uuid() }),
  z.object({ itemId: z.string().uuid() }),
]);

export const sellerMediaRemove = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const biz = ctx.business.id;
  if (!(await rateOk(d.db, `media-remove:${biz}`, 300, 3600))) return rateLimited();
  const store = d.db.storage.from(BUCKET);

  if ("mediaId" in parsed.data) {
    const row = await d.db.from("item_media").select("*").eq("id", parsed.data.mediaId).eq("business_id", biz).maybeSingle();
    if (!row.data) return json({ error: "media_not_found" }, 404);
    const stray = await sweepFolder(store, `${biz}/${row.data.item_id}/${row.data.id}`, 0);
    const paths = [...rowPaths(row.data), ...stray].filter((p) => ownedBy(p, biz, row.data.item_id, row.data.id));
    if (!(await removeObjects(store, paths))) return json({ error: "storage_failed" }, 500);
    const del = await d.db.from("item_media").delete().eq("id", row.data.id).eq("business_id", biz);
    if (del.error) return json({ error: "server_error" }, 500);
    return json({ removed: 1 });
  }

  const { itemId } = parsed.data;
  const item = await d.db.from("items").select("id, business_id").eq("id", itemId).maybeSingle();
  if (!item.data || item.data.business_id !== biz) return json({ error: "item_not_found" }, 404);
  const rows = (await d.db.from("item_media").select("*").eq("item_id", itemId).eq("business_id", biz)).data ?? [];
  const stray = await sweepFolder(store, `${biz}/${itemId}`, 2);
  const paths = [...rows.flatMap(rowPaths), ...stray].filter((p) => ownedBy(p, biz, itemId));
  if (!(await removeObjects(store, paths))) return json({ error: "storage_failed" }, 500);
  const del = await d.db.from("item_media").delete().eq("item_id", itemId).eq("business_id", biz);
  if (del.error) return json({ error: "server_error" }, 500);
  return json({ removed: rows.length });
});
