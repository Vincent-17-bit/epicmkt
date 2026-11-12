import { itemPhotoId } from "../_shared/synced/images.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const BUCKET = "seller-media";

// Duplicate item, step 2. seller_duplicate_item has made the draft; this gives it its own copy of the original's pictures,
// videos, 3D model, poster and spin frames, in the same order, each keeping the option values it belongs to (A17). Variants and option values that pointed at the original's pictures are re-pointed at the copies
// (item_remap_copied_media, migration 0084), because the copies only get their ids here. Every file is a NEW file under the new item (never shared), so deleting one item's media can never
// remove the other's. A file that fails is skipped and reported; the draft and the files that did copy are kept.
const Body = z.object({ fromItemId: z.string().uuid(), toItemId: z.string().uuid() });

type Row = { id?: string; kind: "image" | "video" | "model" | "spin" | "poster"; option_ids?: string[] | null; sort?: number; path: string; mime: string; width: number | null; height: number | null; duration_sec: number | null; size_bytes: number | null };

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
    .select("id, kind, path, mime, width, height, duration_sec, size_bytes, sort, option_ids")
    .eq("item_id", fromItemId).eq("business_id", business)
    .order("sort", { ascending: true });
  if (source.error) return json({ error: "server_error" }, 500);
  const rows = (source.data ?? []) as Row[];

  let copied = 0;
  const idMap: Record<string, string> = {};   // original media id -> its copy
  const failed: { path: string; reason: string }[] = [];
  const store = d.db.storage.from(BUCKET);

  const PURPOSE = { image: "item_photo", video: "item_video", model: "item_model", spin: "item_spin", poster: "item_poster" } as const;
  const spinPosition: Record<string, number> = {};   // frames are re-numbered 0, 1, 2 ... per scope, which keeps their order

  for (const row of rows) {
    const purpose = PURPOSE[row.kind];
    if (!purpose) { failed.push({ path: row.path, reason: "unsupported_type" }); continue; }
    const is3d = row.kind === "model" || row.kind === "spin" || row.kind === "poster";
    const isPicture = row.kind === "image" || row.kind === "spin" || row.kind === "poster";   // Cloudinary; a video or a model is a bucket file
    const ext = row.kind === "model" ? "glb" : /\.(mp4|webm)$/i.exec(row.path)?.[1]?.toLowerCase();
    if (!isPicture && !ext) { failed.push({ path: row.path, reason: "unsupported_type" }); continue; }
    const uuid = crypto.randomUUID();
    const target = isPicture ? itemPhotoId(business, toItemId, uuid) : `${business}/${toItemId}/${uuid}.${ext}`;

    const registered = await d.db.rpc("media_register_upload", { p_business: business, p_item: toItemId, p_purpose: purpose, p_public_id: target });
    if (registered.error) { failed.push({ path: row.path, reason: "server_error" }); continue; }

    // Whatever goes wrong after this point leaves a file under `target`, so it is queued for deletion rather than left behind.
    const discard = async (reason: string) => {
      failed.push({ path: row.path, reason });
      await d.db.rpc("media_gc_enqueue", { p_ids: [target], p_reason: "copy_failed" });
    };

    let stored = false;
    if (isPicture) {
      if (!d.cloudinary) { failed.push({ path: row.path, reason: "media_not_configured" }); await d.db.rpc("media_gc_enqueue", { p_ids: [target], p_reason: "copy_failed" }); continue; }
      stored = await d.cloudinary.copy(row.path, target);
    } else {
      const res = await store.copy(row.path, target);
      stored = !res.error;
    }
    if (!stored) { await discard("copy_failed"); continue; }

    const confirmed = await d.db.rpc("media_confirm_upload", { p_business: business, p_public_id: target });
    if (confirmed.error) { await discard("server_error"); continue; }

    const scope = row.option_ids ?? [];
    let attached;
    if (is3d) {
      const role = row.kind === "model" ? "model-glb" : row.kind === "spin" ? "spin-frame" : "poster";
      const key = scope[0] ?? "";
      const position = row.kind === "spin" ? (spinPosition[key] = (spinPosition[key] ?? -1) + 1) : null;
      attached = await d.db.rpc("attach_item_media3d", {
        p_item: toItemId, p_role: role, p_path: target, p_mime: row.mime, p_width: row.width, p_height: row.height, p_size: row.size_bytes,
        p_option_ids: scope, p_position: position,
      });
    } else {
      attached = await d.db.rpc("attach_item_media", {
        p_item: toItemId, p_kind: row.kind, p_path: target, p_mime: row.mime,
        p_width: row.width, p_height: row.height, p_duration: row.duration_sec, p_size: row.size_bytes,
      });
    }
    if (attached.error) { await discard(/limit_reached/.test(attached.error.message ?? "") ? "limit_reached" : "server_error"); continue; }
    copied += 1;
    if (row.id && typeof attached.data === "string") idMap[row.id] = attached.data;
    // A photo or video keeps the option values it belonged to (the copy has the same value ids). A failure here leaves it on the whole item.
    if (!is3d && scope.length > 0 && typeof attached.data === "string") await d.db.from("item_media").update({ option_ids: scope }).eq("id", attached.data);
  }

  // Always called, even with an empty map: ids of files that did not copy are dropped from variants rather than left pointing at the
  // original item. A failure here must not turn a finished copy into an error; the draft keeps its pictures and the seller can re-pick.
  await d.db.rpc("item_remap_copied_media", { p_item: toItemId, p_map: idMap });   // functions never log: the outcome is not reported

  return json({ copied, failed, total: rows.length });
});
