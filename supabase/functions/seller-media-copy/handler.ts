import { authenticate, json, rateLimited, rateOk, readJson, wrap, z, type Deps } from "../_shared/seller.ts";
import { BUCKET, ownedBy, removeObjects, rowPaths } from "../_shared/media.ts";

// Duplicating an item copies its media into new files and new rows. Nothing is shared with the original: deleting
// one item's media can never touch the other's. Failed uploads and media an admin removed are not copied.
const Body = z.object({ fromItemId: z.string().uuid(), toItemId: z.string().uuid() });

export const sellerMediaCopy = (d: Deps) => wrap(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || parsed.data.fromItemId === parsed.data.toItemId) return json({ error: "bad_request" }, 400);
  const ctx = await authenticate(req, d.db);
  if (ctx instanceof Response) return ctx;
  const biz = ctx.business.id;
  const { fromItemId, toItemId } = parsed.data;
  if (!(await rateOk(d.db, `media-copy:${biz}`, 60, 3600))) return rateLimited();

  const items = (await d.db.from("items").select("id, business_id, variants").eq("business_id", biz)).data ?? [];
  const from = items.find((i: any) => i.id === fromItemId);
  const to = items.find((i: any) => i.id === toItemId);
  if (!from || !to) return json({ error: "item_not_found" }, 404);

  const existing = (await d.db.from("item_media").select("id").eq("item_id", toItemId)).data ?? [];
  if (existing.length) return json({ error: "target_not_empty" }, 409);

  const source = ((await d.db.from("item_media").select("*").eq("item_id", fromItemId).eq("business_id", biz)).data ?? [])
    .filter((m: any) => m.status !== "failed" && !m.removed_by_admin)
    .sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));

  const store = d.db.storage.from(BUCKET);
  const copied: string[] = [];
  const created: string[] = [];
  const undo = async () => {
    await removeObjects(store, copied);
    if (created.length) await d.db.from("item_media").delete().eq("item_id", toItemId).eq("business_id", biz);
  };

  // Variant ids are new on a duplicate (same order), so a media tied to variant 2 stays tied to variant 2.
  const fromVariants: any[] = Array.isArray(from.variants) ? from.variants : [];
  const toVariants: any[] = Array.isArray(to.variants) ? to.variants : [];
  const mapVariant = (id: string | null) => {
    if (!id) return null;
    const at = fromVariants.findIndex((v) => v?.id === id);
    return at >= 0 ? toVariants[at]?.id ?? null : null;
  };

  for (const m of source) {
    if (!ownedBy(m.path, biz, fromItemId, m.id)) { await undo(); return json({ error: "server_error" }, 500); }
    const id = crypto.randomUUID();
    const rename = (p: string) => `${biz}/${toItemId}/${id}/${p.split("/").pop()}`;
    const variants: Record<string, string> = {};
    for (const [w, p] of Object.entries(m.variants ?? {})) variants[w] = rename(p as string);
    for (const p of rowPaths(m)) {
      if (!ownedBy(p, biz, fromItemId, m.id)) { await undo(); return json({ error: "server_error" }, 500); }
      const out = await store.copy(p, rename(p));
      if (out?.error) { await undo(); return json({ error: "storage_failed" }, 500); }
      copied.push(rename(p));
    }
    const attached = await d.db.rpc("attach_item_media", {
      p_item: toItemId, p_media: id, p_kind: m.kind, p_path: rename(m.path), p_mime: m.mime,
      p_width: m.width, p_height: m.height, p_duration: m.duration_sec, p_size: m.size_bytes,
      p_variants: variants, p_poster: m.poster_path ? rename(m.poster_path) : null, p_poster_time: m.poster_time ?? null,
      p_placeholder: m.placeholder ?? null, p_alt: m.alt ?? null, p_variant_id: mapVariant(m.variant_id),
      p_status: m.status, p_fail_reason: null, p_replace: null,
    });
    if (attached.error) {
      await undo();
      return json({ error: /limit_reached/.test(attached.error.message ?? "") ? "limit_reached" : "server_error" }, /limit_reached/.test(attached.error.message ?? "") ? 409 : 500);
    }
    created.push(id);
  }
  return json({ copied: created.length, ids: created }, 201);
});
