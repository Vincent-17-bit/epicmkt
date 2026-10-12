import { supabase } from "../client.js";
import { ApiError } from "../errors.js";

const BUCKET = "seller-media";
const ctx = { businessId: null };

const need = () => {
  if (!supabase) throw new ApiError("not_configured", "The portal is not configured.");
  return supabase;
};

const ok = ({ data, error }) => {
  if (error) throw new ApiError(error.message ?? "request_failed", error.message);
  return data;
};

const invoke = async (name, body) => {
  const { data, error } = await need().functions.invoke(name, { body });
  if (error) {
    let payload = null;
    try { payload = await error.context?.json?.(); } catch { payload = null; }
    throw new ApiError(payload?.error === "limit_reached" ? "limit_reached:gallery_photos" : payload?.error === "pair_category" ? "pair_category" : payload?.error ?? "request_failed", payload?.message, { status: error.context?.status });
  }
  return data;
};

export const publicUrl = (path) => (path ? need().storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null);

export const getWorkspace = async () => {
  const db = need();
  const business = ok(await db.from("businesses").select("id, slug, name, tagline, logo_path, plan_key, status, category_id").single());
  const limits = ok(await db.from("global_limits").select("standard, premium").eq("id", 1).single());
  ctx.businessId = business.id;
  return { business: { ...business, logo_url: publicUrl(business.logo_path) }, global: limits };
};

export const listItems = async () => ok(await need().from("items").select("id, name, price").order("sort").order("name"));

export const getUsage = async () => ok(await need().rpc("seller_promo_usage"));

export const listOffers = async () => {
  const rows = ok(await need().from("offers").select("*, offer_items(item_id)").order("created_at", { ascending: false }));
  return rows.map(({ offer_items, ...o }) => ({ ...o, banner_url: publicUrl(o.banner_path), item_ids: offer_items.map((x) => x.item_id) }));
};

export const saveOffer = async (offerId, draft) => {
  const patch = {
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    discount_type: draft.discount_type,
    discount_value: Number(draft.discount_value),
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    banner_path: draft.banner_path ?? null,
  };
  if (draft.active !== undefined) patch.active = draft.active;
  const row = ok(await need().rpc("seller_save_offer", { p_id: offerId ?? null, p_patch: patch, p_items: draft.item_ids ?? [] }));
  return { ...row, item_ids: draft.item_ids ?? [] };
};

export const deleteOffer = async (offerId) => ok(await need().from("offers").delete().eq("id", offerId));

export const listFlash = async () => ok(await need().from("flash_sales").select("*").order("starts_at", { ascending: false }));

export const createFlash = async (draft) =>
  ok(await need().from("flash_sales").insert({
    business_id: ctx.businessId,
    item_id: draft.item_id,
    discount_type: draft.discount_type,
    discount_value: Number(draft.discount_value),
    ends_at: draft.ends_at,
    on_end: draft.on_end ?? "keep",
    ...(draft.starts_at ? { starts_at: draft.starts_at } : {}),
  }).select().single());

export const updateFlash = async (flashId, patch) =>
  ok(await need().from("flash_sales").update({ on_end: patch.on_end }).eq("id", flashId).select().single());

export const deleteFlash = async (flashId) => ok(await need().from("flash_sales").delete().eq("id", flashId));

export const uploadImage = async ({ blob, folder }) => {
  if (!ctx.businessId) await getWorkspace();
  const path = `${ctx.businessId}/${folder}/${crypto.randomUUID()}.webp`;
  ok(await need().storage.from(BUCKET).upload(path, blob, { contentType: "image/webp", upsert: false }));
  return { path, url: publicUrl(path) };
};

const withUrl = (g) => ({ ...g, url: publicUrl(g.path) });

export const listGallery = async () => {
  const rows = ok(await need().from("gallery_photos").select("*").is("deleted_at", null).order("sort").order("created_at"));
  return rows.map(withUrl);
};

export const addGalleryPhoto = async ({ blob, caption, pairId, pairRole }) => {
  const { path } = await uploadImage({ blob, folder: "gallery" });
  try {
    const done = await invoke("seller-gallery-finalize", { path, caption: caption || undefined, pairId, pairRole });
    return { id: done.id, path, url: publicUrl(path), width: done.width, height: done.height, caption: caption || null, pair_id: pairId ?? null, pair_role: pairRole ?? null };
  } catch (e) {
    await need().storage.from(BUCKET).remove([path]).catch(() => {});
    throw e;
  }
};

export const updateGalleryPhoto = async (photoId, patch) =>
  ok(await need().from("gallery_photos").update({ caption: patch.caption?.trim() || null }).eq("id", photoId).select().single());

export const softDeleteGallery = async (ids) => ok(await need().from("gallery_photos").update({ deleted_at: new Date().toISOString() }).in("id", ids));

export const restoreGallery = async (ids) => ok(await need().from("gallery_photos").update({ deleted_at: null }).in("id", ids));

export const purgeGallery = async (photos) => {
  const db = need();
  ok(await db.from("gallery_photos").delete().in("id", photos.map((p) => p.id)));
  await db.storage.from(BUCKET).remove(photos.map((p) => p.path)).catch(() => {});
};

export const reorderGallery = async (ids) => ok(await need().rpc("seller_reorder_gallery", { p_ids: ids }));

export const listStaff = async () => {
  const rows = ok(await need().from("staff_members").select("*, staff_services(item_id)").order("sort").order("created_at"));
  return rows.map(({ staff_services, ...s }) => ({ ...s, photo_url: publicUrl(s.photo_path), service_ids: staff_services.map((x) => x.item_id) }));
};

export const saveStaff = async (staffId, draft) => {
  const db = need();
  const fields = {
    name: draft.name.trim(),
    role: draft.role?.trim() || null,
    specialties: draft.specialties ?? [],
    photo_path: draft.photo_path ?? null,
  };
  const row = staffId
    ? ok(await db.from("staff_members").update(fields).eq("id", staffId).select().single())
    : ok(await db.from("staff_members").insert({ ...fields, business_id: ctx.businessId }).select().single());
  if (draft.service_ids) {
    ok(await db.from("staff_services").delete().eq("staff_id", row.id));
    if (draft.service_ids.length) {
      ok(await db.from("staff_services").insert(draft.service_ids.map((item_id) => ({ staff_id: row.id, item_id, business_id: ctx.businessId }))));
    }
  }
  return { ...row, photo_url: publicUrl(row.photo_path), service_ids: draft.service_ids ?? [] };
};

export const deleteStaff = async (staffId) => ok(await need().from("staff_members").delete().eq("id", staffId));

export const listSlots = async () => ok(await need().from("timetable_slots").select("*").order("day_of_week").order("start_time"));

export const saveSlot = async (slotId, draft) => {
  const fields = {
    day_of_week: Number(draft.day_of_week),
    start_time: draft.start_time,
    end_time: draft.end_time,
    class_name: draft.class_name.trim(),
    staff_id: draft.staff_id || null,
  };
  const db = need();
  return slotId
    ? ok(await db.from("timetable_slots").update(fields).eq("id", slotId).select().single())
    : ok(await db.from("timetable_slots").insert({ ...fields, business_id: ctx.businessId }).select().single());
};

export const deleteSlot = async (slotId) => ok(await need().from("timetable_slots").delete().eq("id", slotId));
