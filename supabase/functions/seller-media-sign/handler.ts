import { itemPhotoId, shopImageId } from "../_shared/synced/images.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";

const BUCKET = "seller-media";

// Step 1 of a picture upload. The browser asks for permission; the server picks the Cloudinary id, records it, and returns a
// signature for that one id. The seller never chooses where the file goes, so one seller cannot write into another's folder.
const Body = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("item_photo"), itemId: z.string().uuid() }),
  z.object({ purpose: z.literal("item_video"), itemId: z.string().uuid(), type: z.enum(["mp4", "webm"]) }),
  z.object({ purpose: z.literal("logo") }),
  z.object({ purpose: z.literal("cover") }),
]);

export const sellerMediaSign = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  // Videos are not sent to Cloudinary: they stay in the Supabase bucket, so only the picture purposes need it.
  if (parsed.data.purpose !== "item_video" && !d.cloudinary) return json({ error: "media_not_configured" }, 503);
  if (!(await rateOk(d.db, `media-sign:${ctx.business.id}`, 120, 3600))) return rateLimited();

  const body = parsed.data;
  const business = ctx.business.id;

  if (body.purpose === "item_video") {
    const owned = await d.db.from("items").select("id, business_id").eq("id", body.itemId).maybeSingle();
    if (!owned.data || owned.data.business_id !== business) return json({ error: "item_not_found" }, 404);
    // Same rule as photos: say "limit reached" before the seller waits on a 25 MB upload.
    const room = await d.db.rpc("media_limit_ok", { p_item: body.itemId, p_kind: "video" });
    if (room.error) return json({ error: "server_error" }, 500);
    if (room.data !== true) return json({ error: "limit_reached" }, 409);
    // The path starts with this shop's id, which seller-media-finalize and attach_item_media both insist on.
    const path = `${business}/${body.itemId}/${crypto.randomUUID()}.${body.type}`;
    const ticket = await d.db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (ticket.error || !ticket.data?.token) return json({ error: "server_error" }, 500);
    return json({ path, token: ticket.data.token, kind: "video", expiresIn: 7200 });
  }

  const uuid = crypto.randomUUID();
  let itemId: string | null = null;
  let publicId: string;
  if (body.purpose === "item_photo") {
    itemId = body.itemId;
    const owned = await d.db.from("items").select("id, business_id").eq("id", itemId).maybeSingle();
    if (!owned.data || owned.data.business_id !== business) return json({ error: "item_not_found" }, 404);
    // Refuse before the upload, not after: a seller at their photo limit should not wait for a 10 MB upload to be told so.
    const room = await d.db.rpc("media_limit_ok", { p_item: itemId, p_kind: "image" });
    if (room.error) return json({ error: "server_error" }, 500);
    if (room.data !== true) return json({ error: "limit_reached" }, 409);
    publicId = itemPhotoId(business, itemId, uuid);
  } else {
    publicId = shopImageId(business, body.purpose, uuid);
  }

  const registered = await d.db.rpc("media_register_upload", { p_business: business, p_item: itemId, p_purpose: body.purpose, p_public_id: publicId });
  if (registered.error) {
    const m = String(registered.error.message ?? "");
    if (/item_not_found/.test(m)) return json({ error: "item_not_found" }, 404);
    if (/path_not_owned/.test(m)) return json({ error: "forbidden" }, 403);
    return json({ error: "server_error" }, 500);
  }

  const signed = await d.cloudinary!.signUpload(publicId);
  return json({ publicId, uploadUrl: signed.uploadUrl, fields: signed.fields, expiresIn: 3600 });
});
