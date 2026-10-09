import { inspectMedia } from "../_shared/synced/media.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const Body = z.object({ itemId: z.string().uuid(), path: z.string().min(3).max(300) });
const BUCKET = "seller-media";

export const sellerMediaFinalize = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const { itemId, path } = parsed.data;
  if (!path.startsWith(`${ctx.business.id}/`) || path.includes("..")) return json({ error: "forbidden" }, 403);
  if (!(await rateOk(d.db, `media:${ctx.business.id}`, 120, 3600))) return rateLimited();

  const store = d.db.storage.from(BUCKET);
  const discard = async () => { try { await store.remove([path]); } catch {} };

  const taken = await d.db.from("item_media").select("id").eq("path", path).maybeSingle();
  if (taken.data) return json({ error: "already_attached" }, 409);

  const item = await d.db.from("items").select("id, business_id").eq("id", itemId).maybeSingle();
  if (!item.data || item.data.business_id !== ctx.business.id) {
    await discard();
    return json({ error: "item_not_found" }, 404);
  }

  const file = await store.download(path);
  if (file.error || !file.data) return json({ error: "file_not_found" }, 404);
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const info: any = inspectMedia(bytes);
  if (!info.ok) {
    await discard();
    return json({ error: info.reason }, 422);
  }

  const attached = await d.db.rpc("attach_item_media", {
    p_item: itemId, p_kind: info.kind, p_path: path, p_mime: info.mime,
    p_width: info.width, p_height: info.height, p_duration: info.durationSec, p_size: info.size,
  });
  if (attached.error) {
    await discard();
    return json({ error: /limit_reached/.test(attached.error.message ?? "") ? "limit_reached" : "server_error" }, /limit_reached/.test(attached.error.message ?? "") ? 409 : 500);
  }
  return json({ id: attached.data, kind: info.kind, width: info.width, height: info.height, durationSec: info.durationSec, size: info.size }, 201);
});
