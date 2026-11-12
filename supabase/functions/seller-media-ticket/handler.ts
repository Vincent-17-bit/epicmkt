import { itemPhotoId } from "../_shared/synced/images.js";
import { GLB_MIME, MEDIA3D, checkOptionIds, checkTicketRequest } from "../_shared/synced/media3d.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";
import { sellerMediaSign } from "../seller-media-sign/handler.ts";

const BUCKET = "seller-media";

// seller_media_upload_ticket(kind): step 1 of every upload. The server checks type and size from what the browser DECLARES (the real
// bytes are checked again when the upload is finalized), picks the file id itself, records it, and signs that one id.
//   image, video            signed by seller-media-sign exactly as before (this function only adds the checks and the role/maxBytes fields)
//   poster, spin-frame      a picture in Cloudinary, finished by seller-media3d-finalize
//   model-glb               a file in the Supabase bucket (up to 15 MB), finished by seller-media3d-finalize
// optionIds (3D kinds only): none = the whole item, or exactly one option value id. Photos and videos get theirs from seller_set_media_options.
const Body = z.object({
  kind: z.enum(["image", "video", "model-glb", "spin-frame", "poster"]),
  itemId: z.string().uuid(),
  type: z.string().max(40),
  size: z.number().optional(),
  optionIds: z.array(z.string().max(40)).max(MEDIA3D.maxOptionIds + 1).optional(),
});

const STATUS: Record<string, number> = { unsupported_kind: 422, unsupported_type: 422, bad_size: 400, too_large: 413, bad_option_ids: 400, one_option_only: 422 };

export const sellerMediaTicket = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  if (ctx.business.status === "suspended") return json({ error: "read_only" }, 403);
  const { kind, itemId, type, size, optionIds } = parsed.data;

  const checked = checkTicketRequest({ kind, type, size });
  if (!checked.ok) return json(checked.maxBytes ? { error: checked.error, maxBytes: checked.maxBytes } : { error: checked.error }, STATUS[checked.error] ?? 400);
  const { rule } = checked;
  const scope = checkOptionIds(rule.role, optionIds);
  if (!scope.ok) return json({ error: scope.error }, STATUS[scope.error] ?? 400);
  if (rule.delegated && scope.ids.length > 0) return json({ error: "bad_request", detail: "optionIds apply to 3D uploads; use seller_set_media_options for photos and videos" }, 400);
  if (!(await rateOk(d.db, `media-ticket:${ctx.business.id}`, 400, 3600))) return rateLimited();

  // Photos and videos: the existing signer, unchanged. It authenticates, rate-limits and checks the plan limit itself.
  if (rule.delegated) {
    const inner = await sellerMediaSign(d)(new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(kind === "video" ? { purpose: "item_video", itemId, type: checked.type } : { purpose: "item_photo", itemId }),
    }));
    if (inner.status !== 200) return inner;
    return json({ ...(await inner.json()), role: rule.role, maxBytes: rule.maxBytes }, 200);
  }

  const business = ctx.business.id;
  const owned = await d.db.from("items").select("id, business_id").eq("id", itemId).maybeSingle();
  if (!owned.data || owned.data.business_id !== business) return json({ error: "item_not_found" }, 404);
  const scopeId: string = scope.ids[0] ?? "";
  if (scopeId) {
    const has = await d.db.rpc("item_has_option_value", { p_item: itemId, p_id: scopeId });
    if (has.error) return json({ error: "server_error" }, 500);
    if (has.data !== true) return json({ error: "unknown_option_value" }, 422);
  }

  // Say "limit reached" before the seller waits on an upload. attach_item_media3d enforces the same limits again under a lock.
  // A model or poster REPLACES the one in its scope, so only a spin frame can hit the per-scope limit; the whole-item cap applies to all.
  const rows = await d.db.from("item_media").select("kind, option_ids").eq("item_id", itemId).in("kind", ["model", "spin", "poster"]).limit(MEDIA3D.maxRowsPerItem + 1);
  if (rows.error) return json({ error: "server_error" }, 500);
  const have = (rows.data ?? []) as { kind: string; option_ids: string[] | null }[];
  const inScope = have.filter((r) => (r.option_ids?.[0] ?? "") === scopeId);
  const replaces = rule.role === "model-glb" ? inScope.some((r) => r.kind === "model") : rule.role === "poster" ? inScope.some((r) => r.kind === "poster") : false;
  if (rule.role === "spin-frame" && inScope.filter((r) => r.kind === "spin").length >= MEDIA3D.spinMaxFrames) return json({ error: "limit_reached", limit: "spin_frames", max: MEDIA3D.spinMaxFrames }, 409);
  if (!replaces && have.length >= MEDIA3D.maxRowsPerItem) return json({ error: "limit_reached", limit: "media3d", max: MEDIA3D.maxRowsPerItem }, 409);

  // Tickets that were handed out and never finished (the sweep removes them after an hour, a model after three) count against the item,
  // so a script cannot ask for tickets without ever uploading.
  const pending = await d.db.from("media_uploads").select("public_id").eq("item_id", itemId).in("purpose", ["item_model", "item_poster", "item_spin"]).limit(MEDIA3D.maxPendingTickets);
  if (pending.error) return json({ error: "server_error" }, 500);
  if ((pending.data ?? []).length >= MEDIA3D.maxPendingTickets) return json({ error: "too_many_pending", max: MEDIA3D.maxPendingTickets }, 429);

  const uuid = crypto.randomUUID();
  const storage = rule.storage;
  if (!storage && !d.cloudinary) return json({ error: "media_not_configured" }, 503);
  const id = storage ? `${business}/${itemId}/${uuid}.glb` : itemPhotoId(business, itemId, uuid);

  // Recorded before the ticket exists, so a file that is uploaded but never finalized is found and swept (model tickets get three hours).
  const registered = await d.db.rpc("media_register_upload", { p_business: business, p_item: itemId, p_purpose: rule.purpose, p_public_id: id });
  if (registered.error) {
    const m = String(registered.error.message ?? "");
    if (/item_not_found/.test(m)) return json({ error: "item_not_found" }, 404);
    if (/path_not_owned/.test(m)) return json({ error: "forbidden" }, 403);
    return json({ error: "server_error" }, 500);
  }

  const common = { kind: rule.role, role: rule.role, maxBytes: rule.maxBytes, optionIds: scope.ids };
  if (storage) {
    const ticket = await d.db.storage.from(BUCKET).createSignedUploadUrl(id);
    if (ticket.error || !ticket.data?.token) return json({ error: "server_error" }, 500);
    return json({ ...common, path: id, token: ticket.data.token, contentType: GLB_MIME, expiresIn: 7200 });
  }
  const signed = await d.cloudinary!.signUpload(id);
  return json({ ...common, publicId: id, uploadUrl: signed.uploadUrl, fields: signed.fields, expiresIn: 3600 });
});
