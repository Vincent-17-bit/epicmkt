import { isCloudinaryId, ownsImageId, UPLOAD_FORMATS } from "../_shared/synced/images.js";
import { GLB_MIME, MEDIA3D, checkOptionIds, inspectGlb } from "../_shared/synced/media3d.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const BUCKET = "seller-media";

// Last step of a poster, spin-frame or model-glb upload. The role comes from what the ticket was issued for, never from the browser.
//   poster, spin-frame  the browser reports what Cloudinary answered; Cloudinary signed it, so a made-up id or version is refused
//   model-glb           the file is read back from the bucket and checked byte by byte (inspectGlb); anything else is deleted
// Any failure after the file exists queues it for deletion, so a refused upload never lingers.
const Hosted = z.object({
  version: z.union([z.number().int().positive(), z.string().regex(/^[0-9]{1,16}$/)]),
  signature: z.string().min(16).max(128),
  width: z.number().int().min(1).max(30000),
  height: z.number().int().min(1).max(30000),
  bytes: z.number().int().min(1).max(60_000_000),
  format: z.enum(UPLOAD_FORMATS as [string, ...string[]]),
});
const Body = z.object({
  itemId: z.string().uuid(),
  path: z.string().min(3).max(300),
  optionIds: z.array(z.string().max(40)).max(MEDIA3D.maxOptionIds + 1).optional(),
  position: z.number().int().min(0).max(MEDIA3D.spinMaxFrames - 1).optional(),
  cloudinary: Hosted.optional(),
});

const ROLE_OF_PURPOSE: Record<string, string> = { item_model: "model-glb", item_poster: "poster", item_spin: "spin-frame" };
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const STATUS: Record<string, number> = {
  limit_reached: 409, unknown_option_value: 422, bad_option_ids: 422, bad_position: 422, item_not_found: 404, path_not_owned: 403, invalid_role: 422,
  unsupported_type: 422, corrupt: 422, external_resources: 422, too_large: 413,
};

export const sellerMedia3dFinalize = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (ctx.business.status === "suspended") return json({ error: "read_only" }, 403);
  const business = ctx.business.id;
  const { itemId, path, cloudinary } = parsed.data;
  if (!path.startsWith(`${business}/${itemId}/`) || path.includes("..")) return json({ error: "forbidden" }, 403);
  if (!(await rateOk(d.db, `media3d:${business}`, 400, 3600))) return rateLimited();

  // Whatever the role, a bad scope or position is refused before the ticket is used up.
  const scope = checkOptionIds("poster", parsed.data.optionIds);   // 3D assets: none or exactly one (the role is checked again below)
  if (!scope.ok) return json({ error: scope.error }, 400);

  const taken = await d.db.from("item_media").select("id").eq("path", path).maybeSingle();
  if (taken.data) return json({ error: "already_attached" }, 409);

  const discard = async (reason: string) => {
    if (isCloudinaryId(path)) await d.db.rpc("media_gc_enqueue", { p_ids: [path], p_reason: reason });
    else {
      try { await d.db.storage.from(BUCKET).remove([path]); } catch { /* the queue below catches it */ }
      await d.db.rpc("media_gc_enqueue", { p_ids: [path], p_reason: reason });
    }
  };

  // Pictures: everything that can be refused without touching the ticket is checked first, as in seller-media-finalize.
  const hosted = isCloudinaryId(path);
  if (hosted) {
    if (!d.cloudinary) return json({ error: "media_not_configured" }, 503);
    if (!cloudinary || !ownsImageId(business, path)) return json({ error: cloudinary ? "forbidden" : "bad_request" }, cloudinary ? 403 : 400);
    if (!(await d.cloudinary.verifyResponse({ publicId: path, version: cloudinary.version, signature: cloudinary.signature }))) return json({ error: "forbidden" }, 403);
  }

  const confirmed = await d.db.rpc("media_confirm_upload", { p_business: business, p_public_id: path });
  if (confirmed.error) {
    const gone = /upload_not_found/.test(String(confirmed.error.message));
    return json({ error: gone ? "upload_not_found" : "server_error" }, gone ? 404 : 500);
  }
  const issued = confirmed.data as { purpose: string; item_id: string | null } | null;
  const role = ROLE_OF_PURPOSE[issued?.purpose ?? ""];
  if (!role || issued?.item_id !== itemId) return json({ error: "forbidden" }, 403);

  let size: number;
  let width: number | null = null;
  let height: number | null = null;
  let mime: string;

  if (role === "model-glb") {
    if (hosted || !path.toLowerCase().endsWith(".glb")) { await discard("model_refused"); return json({ error: "unsupported_type" }, 422); }
    const file = await d.db.storage.from(BUCKET).download(path);
    if (file.error || !file.data) return json({ error: "file_not_found" }, 404);
    // The Blob knows its size, so an oversized file is refused without reading it into memory.
    if (file.data.size > MEDIA3D.modelMaxBytes) { await discard("model_refused"); return json({ error: "too_large", maxBytes: MEDIA3D.modelMaxBytes }, 413); }
    const info = inspectGlb(new Uint8Array(await file.data.arrayBuffer()));
    if (!info.ok) { await discard("model_refused"); return json({ error: info.reason }, STATUS[info.reason] ?? 422); }
    size = info.size; mime = GLB_MIME;
  } else {
    if (!hosted || !cloudinary) return json({ error: "forbidden" }, 403);   // a picture role always has a Cloudinary id (the DB insists)
    if (cloudinary.bytes > MEDIA3D.imageMaxBytes) { await discard("picture_refused"); return json({ error: "too_large", maxBytes: MEDIA3D.imageMaxBytes }, 413); }
    size = cloudinary.bytes; width = cloudinary.width; height = cloudinary.height; mime = MIME[cloudinary.format];
  }

  const attached = await d.db.rpc("attach_item_media3d", {
    p_item: itemId, p_role: role, p_path: path, p_mime: mime, p_width: width, p_height: height, p_size: size,
    p_option_ids: scope.ids, p_position: role === "spin-frame" ? (parsed.data.position ?? null) : null,
  });
  if (attached.error) {
    const m = String(attached.error.message ?? "");
    const code = /limit_reached/.test(m) ? "limit_reached" : (m.match(/unknown_option_value|bad_option_ids|bad_position|item_not_found|path_not_owned|invalid_role/)?.[0] ?? null);
    await discard(code ?? "attach_failed");
    return json(code === "limit_reached" ? { error: code, limit: /spin_frames/.test(m) ? "spin_frames" : "media3d" } : { error: code ?? "server_error" }, code ? STATUS[code] : 500);
  }
  return json({ id: attached.data, role, kind: role === "model-glb" ? "model" : role === "poster" ? "poster" : "spin", size, width, height, optionIds: scope.ids }, 201);
});
