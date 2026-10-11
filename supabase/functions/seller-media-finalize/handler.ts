import { inspectMedia, inspectVariant, MEDIA_RULES, parseMediaPath } from "../_shared/synced/media.js";
import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";
import { BUCKET, ownedBy, removeObjects } from "../_shared/media.ts";

// Two things happen here, told apart by `action`:
//   attach (default): the browser has uploaded the files for one media; read the real bytes, check everything, then
//                     create (or replace) the media row. Any failure deletes what was uploaded.
//   poster:           the browser has uploaded a new poster for a video that already exists.
// The declared MIME type, the file name and the extension are never trusted. Only the bytes decide.

const path = z.string().min(3).max(300);
const placeholder = z.string().max(4000).regex(/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/);

const Attach = z.object({
  action: z.literal("attach").optional(),
  itemId: z.string().uuid(),
  path,
  variants: z.record(z.string().regex(/^[0-9]{2,4}$/), path).refine((v) => Object.keys(v).length <= 7, "too_many_variants").optional(),
  poster: path.optional(),
  posterTimeSec: z.number().min(0).max(MEDIA_RULES.videoMaxSeconds).optional(),
  placeholder: placeholder.optional(),
  alt: z.string().max(120).nullable().optional(),
  variantId: z.string().max(80).nullable().optional(),
  replaceMediaId: z.string().uuid().optional(),
});

const Poster = z.object({
  action: z.literal("poster"),
  itemId: z.string().uuid(),
  mediaId: z.string().uuid(),
  path,
  timeSec: z.number().min(0).max(MEDIA_RULES.videoMaxSeconds).nullable().optional(),
});

const FAILURES: Record<string, [number, string]> = {
  "limit_reached": [409, "limit_reached"],
  "media_not_found": [404, "media_not_found"],
  "removed_by_admin": [409, "removed_by_admin"],
  "kind_mismatch": [422, "kind_mismatch"],
  "path_not_owned": [403, "forbidden"],
  "variant_not_found": [422, "variant_not_found"],
  "alt_too_long": [422, "alt_too_long"],
  "poster_only_video": [422, "poster_only_video"],
  "item_not_found": [404, "item_not_found"],
  "duplicate key": [409, "already_attached"],
};
const failure = (message = "") => {
  const hit = Object.keys(FAILURES).find((k) => message.includes(k));
  return hit ? json({ error: FAILURES[hit][1] }, FAILURES[hit][0]) : json({ error: "server_error" }, 500);
};

const bytesOf = async (store: any, p: string): Promise<Uint8Array | null> => {
  const file = await store.download(p);
  if (file.error || !file.data) return null;
  return new Uint8Array(await file.data.arrayBuffer());
};

export const sellerMediaFinalize = (d: Deps) => wrap(async (req) => {
  const body = await readJson(req);
  const isPoster = (body as any)?.action === "poster";
  const parsed = isPoster ? Poster.safeParse(body) : Attach.safeParse(body);
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const biz = ctx.business.id;
  const store = d.db.storage.from(BUCKET);

  if (isPoster) return poster(d, store, ctx, parsed.data as z.infer<typeof Poster>);

  const input = parsed.data as z.infer<typeof Attach>;
  const { itemId } = input;
  const main = ownedBy(input.path, biz, itemId);
  // Not shaped like one of this seller's objects for this item: refuse, and touch nothing. It may not be theirs to delete.
  if (!main) return json({ error: "forbidden" }, 403);
  const mediaId = main.mediaId;

  const extras = [...Object.values(input.variants ?? {}), ...(input.poster ? [input.poster] : [])];
  const ours = [...new Set([input.path, ...extras.filter((p) => ownedBy(p, biz, itemId, mediaId))])];
  const discard = () => removeObjects(store, ours);
  if (extras.some((p) => !ownedBy(p, biz, itemId, mediaId))) {
    await discard();
    return json({ error: "forbidden" }, 403);
  }
  if (!(await rateOk(d.db, `media:${biz}`, 120, 3600))) return rateLimited();

  const taken = await d.db.from("item_media").select("id").eq("path", input.path).maybeSingle();
  if (taken.data) return json({ error: "already_attached" }, 409);

  const item = await d.db.from("items").select("id, business_id").eq("id", itemId).maybeSingle();
  if (!item.data || item.data.business_id !== biz) {
    await discard();
    return json({ error: "item_not_found" }, 404);
  }

  const bytes = await bytesOf(store, input.path);
  if (!bytes) return json({ error: "file_not_found" }, 404);
  const info: any = inspectMedia(bytes);
  if (!info.ok) {
    await discard();
    return json({ error: info.reason }, 422);
  }

  // Responsive variants and the poster must be real images too, whatever their names say.
  for (const p of extras) {
    if (p === input.path) continue;
    const other = await bytesOf(store, p);
    const check: any = other ? inspectVariant(other) : { ok: false, reason: "file_not_found" };
    if (!check.ok) {
      await discard();
      return json({ error: check.reason }, check.reason === "file_not_found" ? 404 : 422);
    }
  }
  if (input.poster && info.kind !== "video") {
    await discard();
    return json({ error: "poster_only_video" }, 422);
  }

  // A video nobody can play, or that has no poster yet, is kept so the seller sees why. Shoppers never see it.
  let status = "ready";
  let failReason: string | null = null;
  if (info.kind === "video" && info.codec === "hevc") { status = "failed"; failReason = "unsupported_codec"; }
  else if (info.kind === "video" && !input.poster) status = "processing";

  const attached = await d.db.rpc("attach_item_media", {
    p_item: itemId, p_media: mediaId, p_kind: info.kind, p_path: input.path, p_mime: info.mime,
    p_width: info.width, p_height: info.height, p_duration: info.durationSec, p_size: info.size,
    p_variants: input.variants ?? {}, p_poster: input.poster ?? null, p_poster_time: input.posterTimeSec ?? null,
    p_placeholder: input.placeholder ?? null, p_alt: input.alt ?? null, p_variant_id: input.variantId ?? null,
    p_status: status, p_fail_reason: failReason, p_replace: input.replaceMediaId ?? null,
  });
  if (attached.error) {
    await discard();
    return failure(attached.error.message ?? "");
  }
  // A replacement frees the files of the media it replaced. A failure here leaves a stray file, never a broken row.
  const old: string[] = attached.data?.removed ?? [];
  if (old.length) await removeObjects(store, old.filter((p) => ownedBy(p, biz, itemId) && !ours.includes(p)));
  return json({
    id: attached.data?.id ?? mediaId, kind: info.kind, status, failReason, sort: attached.data?.sort ?? null,
    width: info.width, height: info.height, durationSec: info.durationSec, size: info.size, codec: info.codec ?? null,
  }, 201);
});

async function poster(d: Deps, store: any, ctx: any, input: z.infer<typeof Poster>) {
  const biz = ctx.business.id;
  const target = ownedBy(input.path, biz, input.itemId, input.mediaId);
  if (!target) return json({ error: "forbidden" }, 403);
  if (!(await rateOk(d.db, `media:${biz}`, 120, 3600))) return rateLimited();
  const row = await d.db.from("item_media").select("id, kind, business_id, item_id, removed_by_admin").eq("id", input.mediaId).eq("business_id", biz).maybeSingle();
  if (!row.data || row.data.item_id !== input.itemId) {
    await removeObjects(store, [input.path]);
    return json({ error: "media_not_found" }, 404);
  }
  if (row.data.kind !== "video") { await removeObjects(store, [input.path]); return json({ error: "poster_only_video" }, 422); }
  if (row.data.removed_by_admin) { await removeObjects(store, [input.path]); return json({ error: "removed_by_admin" }, 409); }
  const bytes = await bytesOf(store, input.path);
  if (!bytes) return json({ error: "file_not_found" }, 404);
  const check: any = inspectVariant(bytes);
  if (!check.ok) {
    await removeObjects(store, [input.path]);
    return json({ error: check.reason }, 422);
  }
  const done = await d.db.rpc("set_media_poster", { p_media: input.mediaId, p_business: biz, p_path: input.path, p_time: input.timeSec ?? null });
  if (done.error) {
    await removeObjects(store, [input.path]);
    return failure(done.error.message ?? "");
  }
  const previous = done.data as string | null;
  if (previous && previous !== input.path && parseMediaPath(previous, { businessId: biz, itemId: input.itemId })) await removeObjects(store, [previous]);
  return json({ id: input.mediaId, poster: input.path, posterTimeSec: input.timeSec ?? null }, 200);
}
