import { inspectMedia } from "../_shared/synced/media.js";
import { isCloudinaryId, ownsImageId, UPLOAD_FORMATS } from "../_shared/synced/images.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const BUCKET = "seller-media";

// Pictures go to Cloudinary; the browser reports what Cloudinary answered. Cloudinary signs that answer with the API secret,
// so a made-up id or version is refused, and the id must be one this seller was signed in seller-media-sign.
const Hosted = z.object({
  version: z.union([z.number().int().positive(), z.string().regex(/^[0-9]{1,16}$/)]),
  signature: z.string().min(16).max(128),
  width: z.number().int().min(1).max(30000),
  height: z.number().int().min(1).max(30000),
  bytes: z.number().int().min(1).max(60_000_000),
  format: z.enum(UPLOAD_FORMATS as [string, ...string[]]),
});
const Body = z.object({
  itemId: z.string().uuid().optional(), path: z.string().min(3).max(300), cloudinary: Hosted.optional(),
  caption: z.string().trim().max(120).optional(), pairId: z.string().uuid().optional(), pairRole: z.enum(["before", "after"]).optional(),
}).refine((b) => (b.pairId === undefined) === (b.pairRole === undefined));

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const sellerMediaFinalize = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const { itemId, path, cloudinary } = parsed.data;
  const gallery = { caption: parsed.data.caption, pairId: parsed.data.pairId, pairRole: parsed.data.pairRole };
  if (!path.startsWith(`${ctx.business.id}/`) || path.includes("..")) return json({ error: "forbidden" }, 403);
  if (!(await rateOk(d.db, `media:${ctx.business.id}`, 120, 3600))) return rateLimited();

  if (isCloudinaryId(path)) return finalizeHosted(d, ctx.business.id, ctx.business.status, path, itemId, cloudinary, gallery);
  if (!itemId) return json({ error: "bad_request" }, 400);
  return finalizeStored(d, ctx.business.id, path, itemId);
});

// Pictures in Cloudinary: shop logo, shop cover and item photos.
async function finalizeHosted(d: Deps, businessId: string, status: string, path: string, itemId: string | undefined, hosted: z.infer<typeof Hosted> | undefined, gallery: { caption?: string; pairId?: string; pairRole?: string } = {}) {
  if (!d.cloudinary) return json({ error: "media_not_configured" }, 503);
  if (!hosted || !ownsImageId(businessId, path)) return json({ error: hosted ? "forbidden" : "bad_request" }, hosted ? 403 : 400);
  if (!(await d.cloudinary.verifyResponse({ publicId: path, version: hosted.version, signature: hosted.signature }))) return json({ error: "forbidden" }, 403);

  const confirmed = await d.db.rpc("media_confirm_upload", { p_business: businessId, p_public_id: path });
  if (confirmed.error) return json({ error: /upload_not_found/.test(String(confirmed.error.message)) ? "upload_not_found" : "server_error" }, /upload_not_found/.test(String(confirmed.error.message)) ? 404 : 500);
  const issued = confirmed.data as { purpose: string; item_id: string | null };

  if (issued.purpose === "gallery") {
    if (status === "suspended") return json({ error: "read_only" }, 403);
    const taken = await d.db.from("gallery_photos").select("id").eq("path", path).maybeSingle();
    if (taken.data) return json({ error: "already_attached" }, 409);
    const attached = await d.db.rpc("attach_gallery_photo", {
      p_business: businessId, p_path: path, p_mime: MIME[hosted.format], p_width: hosted.width, p_height: hosted.height, p_size: hosted.bytes,
      p_caption: gallery.caption ?? null, p_pair_id: gallery.pairId ?? null, p_pair_role: gallery.pairRole ?? null,
    });
    if (attached.error) {
      const msg = attached.error.message ?? "";
      const code = /limit_reached/.test(msg) ? "limit_reached" : /pair_category/.test(msg) ? "pair_category" : /duplicate key/.test(msg) ? "already_attached" : null;
      if (code !== "already_attached") await d.db.rpc("media_gc_enqueue", { p_ids: [path], p_reason: code ?? "attach_failed" });
      return json({ error: code ?? "server_error" }, code ? (code === "pair_category" ? 422 : 409) : 500);
    }
    return json({ id: attached.data, kind: "gallery", width: hosted.width, height: hosted.height, size: hosted.bytes }, 201);
  }

  // Shop logo, cover and team photos: nothing to attach here. The browser saves the id on the profile next (seller_update_profile).
  if (issued.purpose !== "item_photo") return json({ path, kind: issued.purpose, width: hosted.width, height: hosted.height, size: hosted.bytes }, 200);

  if (!itemId || itemId !== issued.item_id) return json({ error: "bad_request" }, 400);
  const taken = await d.db.from("item_media").select("id").eq("path", path).maybeSingle();
  if (taken.data) return json({ error: "already_attached" }, 409);

  const attached = await d.db.rpc("attach_item_media", {
    p_item: itemId, p_kind: "image", p_path: path, p_mime: MIME[hosted.format],
    p_width: hosted.width, p_height: hosted.height, p_duration: null, p_size: hosted.bytes,
  });
  if (attached.error) {
    const limit = /limit_reached/.test(attached.error.message ?? "");
    // The file is already in Cloudinary; queue it so it is deleted rather than lingering. (The sweep would catch it within the hour.)
    if (limit) await d.db.rpc("media_gc_enqueue", { p_ids: [path], p_reason: "limit_reached" });
    return json({ error: limit ? "limit_reached" : "server_error" }, limit ? 409 : 500);
  }
  return json({ id: attached.data, kind: "image", width: hosted.width, height: hosted.height, durationSec: null, size: hosted.bytes }, 201);
}

// Videos: still in the Supabase bucket, checked from the real bytes. Only a path this shop was signed for (seller-media-sign records it)
// is accepted, and the file must be what its extension says, so a picture cannot be attached as a video or the other way round.
const EXT = /\.(mp4|webm)$/i;
async function finalizeStored(d: Deps, businessId: string, path: string, itemId: string) {
  const store = d.db.storage.from(BUCKET);
  const discard = async () => { try { await store.remove([path]); } catch { /* the sweep queues it */ } };

  if (!path.startsWith(`${businessId}/${itemId}/`) || !EXT.test(path)) return json({ error: EXT.test(path) ? "forbidden" : "unsupported_type" }, EXT.test(path) ? 403 : 422);

  const taken = await d.db.from("item_media").select("id").eq("path", path).maybeSingle();
  if (taken.data) return json({ error: "already_attached" }, 409);

  const item = await d.db.from("items").select("id, business_id").eq("id", itemId).maybeSingle();
  if (!item.data || item.data.business_id !== businessId) {
    await discard();
    return json({ error: "item_not_found" }, 404);
  }

  const confirmed = await d.db.rpc("media_confirm_upload", { p_business: businessId, p_public_id: path });
  if (confirmed.error) {
    const gone = /upload_not_found/.test(String(confirmed.error.message));
    return json({ error: gone ? "upload_not_found" : "server_error" }, gone ? 404 : 500);
  }
  const issued = confirmed.data as { purpose: string; item_id: string | null } | null;
  if (issued?.purpose !== "item_video" || issued.item_id !== itemId) return json({ error: "forbidden" }, 403);

  const file = await store.download(path);
  if (file.error || !file.data) return json({ error: "file_not_found" }, 404);
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const info: any = inspectMedia(bytes);
  if (!info.ok) {
    await discard();
    return json({ error: info.reason }, 422);
  }
  if (info.kind !== "video" || !path.toLowerCase().endsWith(`.${info.type}`)) {
    await discard();
    return json({ error: "unsupported_type" }, 422);
  }

  const attached = await d.db.rpc("attach_item_media", {
    p_item: itemId, p_kind: info.kind, p_path: path, p_mime: info.mime,
    p_width: info.width, p_height: info.height, p_duration: info.durationSec, p_size: info.size,
  });
  if (attached.error) {
    const limit = /limit_reached/.test(attached.error.message ?? "");
    if (limit) await discard();
    return json({ error: limit ? "limit_reached" : "server_error" }, limit ? 409 : 500);
  }
  return json({ id: attached.data, kind: info.kind, width: info.width, height: info.height, durationSec: info.durationSec, size: info.size }, 201);
}
