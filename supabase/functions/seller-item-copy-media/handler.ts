import { itemPhotoId } from "../_shared/synced/images.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const BUCKET = "seller-media";

// Duplicate item, step 2. seller_duplicate_item has made the draft; this gives it its own copy of the original's pictures and
// videos, in the same order. Variants and option values that pointed at the original's pictures are re-pointed at the copies
// (item_remap_copied_media, migration 0084), because the copies only get their ids here. Every file is a NEW file under the new item (never shared), so deleting one item's media can never
// remove the other's. A file that fails is skipped and reported; the draft and the files that did copy are kept.
const Body = z.object({ fromItemId: z.string().uuid(), toItemId: z.string().uuid() });

type Row = { id?: string; kind: "image" | "video"; path: string; mime: string; width: number | null; height: number | null; duration_sec: number | null; size_bytes: number | null };

export const sellerItemCopyMedia = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || parsed.data.fromItemId === parsed.data.toItemId) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (ctx.business.status === "suspended") return json({ error: "read_only" }, 403);
  const business = ctx.business.id;
  const { fromItemId, toItemId } = parsed.data;
  if (!(await rateOk(d.db, `media-copy:${business}`, 60, 3600))) return rateLimited();

  for (const id of [fromItemId, toItemId]) {
    const owned = await d.db.from("items").select("id, business_id").eq("id", id).maybeSingle();
    if (!owned.data || owned.data.business_id !== business) return json({ error: "item_not_found" }, 404);
  }
  // Only a draft that has no media yet can be filled, so this can never pile copies onto an item that already has its own.
  const existing = await d.db.from("item_media").select("id").eq("item_id", toItemId).limit(1);
  if (existing.error) return json({ error: "server_error" }, 500);
  if ((existing.data ?? []).length > 0) return json({ error: "target_not_empty" }, 409);

  const source = await d.db.from("item_media")
    .select("id, kind, path, mime, width, height, duration_sec, size_bytes")
    .eq("item_id", fromItemId).eq("business_id", business)
    .order("sort", { ascending: true });
  if (source.error) return json({ error: "server_error" }, 500);
  const rows = (source.data ?? []) as Row[];

  let copied = 0;
  const idMap: Record<string, string> = {};   // original media id -> its copy
  const failed: { path: string; reason: string }[] = [];
  const store = d.db.storage.from(BUCKET);

  for (const row of rows) {
    const isImage = row.kind === "image";
    const ext = /\.(mp4|webm)$/i.exec(row.path)?.[1]?.toLowerCase();
    if (!isImage && !ext) { failed.push({ path: row.path, reason: "unsupported_type" }); continue; }
    const uuid = crypto.randomUUID();
    const target = isImage ? itemPhotoId(business, toItemId, uuid) : `${business}/${toItemId}/${uuid}.${ext}`;

    const registered = await d.db.rpc("media_register_upload", { p_business: business, p_item: toItemId, p_purpose: isImage ? "item_photo" : "item_video", p_public_id: target });
    if (registered.error) { failed.push({ path: row.path, reason: "server_error" }); continue; }

    // Whatever goes wrong after this point leaves a file under `target`, so it is queued for deletion rather than left behind.
    const discard = async (reason: string) => {
      failed.push({ path: row.path, reason });
      await d.db.rpc("media_gc_enqueue", { p_ids: [target], p_reason: "copy_failed" });
    };

    let stored = false;
    if (isImage) {
      if (!d.cloudinary) { failed.push({ path: row.path, reason: "media_not_configured" }); await d.db.rpc("media_gc_enqueue", { p_ids: [target], p_reason: "copy_failed" }); continue; }
      stored = await d.cloudinary.copy(row.path, target);
    } else {
      const res = await store.copy(row.path, target);
      stored = !res.error;
    }
    if (!stored) { await discard("copy_failed"); continue; }

    const confirmed = await d.db.rpc("media_confirm_upload", { p_business: business, p_public_id: target });
    if (confirmed.error) { await discard("server_error"); continue; }

    const attached = await d.db.rpc("attach_item_media", {
      p_item: toItemId, p_kind: row.kind, p_path: target, p_mime: row.mime,
      p_width: row.width, p_height: row.height, p_duration: row.duration_sec, p_size: row.size_bytes,
    });
    if (attached.error) { await discard(/limit_reached/.test(attached.error.message ?? "") ? "limit_reached" : "server_error"); continue; }
    copied += 1;
    if (row.id && typeof attached.data === "string") idMap[row.id] = attached.data;
  }

  // Always called, even with an empty map: ids of files that did not copy are dropped from variants rather than left pointing at the
  // original item. A failure here must not turn a finished copy into an error; the draft keeps its pictures and the seller can re-pick.
  await d.db.rpc("item_remap_copied_media", { p_item: toItemId, p_map: idMap });   // functions never log: the outcome is not reported

  return json({ copied, failed, total: rows.length });
});
