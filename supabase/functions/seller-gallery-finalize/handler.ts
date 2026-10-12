import { inspectMedia } from "../_shared/synced/media.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({
  path: z.string().min(3).max(300),
  caption: z.string().trim().max(120).optional(),
  pairId: z.string().uuid().optional(),
  pairRole: z.enum(["before", "after"]).optional(),
}).refine((b) => (b.pairId === undefined) === (b.pairRole === undefined));
const BUCKET = "seller-media";

export const sellerGalleryFinalize = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const { path, caption, pairId, pairRole } = parsed.data;
  if (!path.startsWith(`${ctx.business.id}/gallery/`) || path.includes("..")) return json({ error: "forbidden" }, 403);
  if (!(await rateOk(d.db, `gallery:${ctx.business.id}`, 120, 3600))) return rateLimited();

  const store = d.db.storage.from(BUCKET);
  const discard = async () => { try { await store.remove([path]); } catch {} };

  if (ctx.business.status !== "live") {
    await discard();
    return json({ error: "read_only" }, 403);
  }

  const taken = await d.db.from("gallery_photos").select("id").eq("path", path).maybeSingle();
  if (taken.data) return json({ error: "already_attached" }, 409);

  const file = await store.download(path);
  if (file.error || !file.data) return json({ error: "file_not_found" }, 404);
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const info: any = inspectMedia(bytes);
  if (!info.ok) {
    await discard();
    return json({ error: info.reason }, 422);
  }
  if (info.kind !== "image") {
    await discard();
    return json({ error: "unsupported_type" }, 422);
  }

  const attached = await d.db.rpc("attach_gallery_photo", {
    p_business: ctx.business.id, p_path: path, p_mime: info.mime, p_width: info.width, p_height: info.height, p_size: info.size,
    p_caption: caption ?? null, p_pair_id: pairId ?? null, p_pair_role: pairRole ?? null,
  });
  if (attached.error) {
    await discard();
    const msg = attached.error.message ?? "";
    if (/limit_reached/.test(msg)) return json({ error: "limit_reached" }, 409);
    if (/pair_category/.test(msg)) return json({ error: "pair_category" }, 422);
    if (/duplicate key/.test(msg)) return json({ error: "already_attached" }, 409);
    return json({ error: "server_error" }, 500);
  }
  return json({ id: attached.data, width: info.width, height: info.height, size: info.size }, 201);
});
