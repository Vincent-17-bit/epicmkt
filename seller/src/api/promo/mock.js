import {
  limitsFor, validateOfferDraft, validateFlashDraft, checkFlashLimits, isCountedOffer, isCountedFlash, isCountedRow, eatMonthKey,
  findTrainerConflict, validateSlotDraft, validateStaffDraft, canPair, teamCapabilities, toMs,
} from "@epicmkt/shared";
import { ApiError } from "../errors.js";

const wait = () => new Promise((r) => setTimeout(r, 60));

const DEFAULT_ITEMS = [
  { id: "i1", name: "Haircut", price: 1000 },
  { id: "i2", name: "Colour", price: 3000 },
  { id: "i3", name: "Braids", price: 2500 },
  { id: "i4", name: "Facial", price: 1800 },
  { id: "i5", name: "Bridal package", price: null },
];

const fresh = () => ({
  business: { id: "b-demo", slug: "demo-shop", name: "Demo Shop", tagline: "Walk-ins welcome", logo_path: null, plan_key: "standard", status: "live", category_id: "salon-beauty" },
  items: DEFAULT_ITEMS.map((i) => ({ ...i })),
  offers: [],
  flash: [],
  gallery: [],
  staff: [],
  slots: [],
  seq: 0,
});

let state = fresh();

const id = (p) => `${p}${++state.seq}`;
const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();
const must = () => {
  if (state.business.status !== "live") throw new ApiError("row-level security");
};
const plan = () => state.business.plan_key;
const clone = (v) => JSON.parse(JSON.stringify(v));

export const resetPromoMock = (overrides = {}) => {
  state = fresh();
  Object.assign(state.business, overrides);
};

export const readOverrides = (search) => {
  const q = new URLSearchParams(search);
  const out = {};
  if (q.get("plan")) out.plan_key = q.get("plan");
  if (q.get("status")) out.status = q.get("status");
  if (q.get("category")) out.category_id = q.get("category");
  return out;
};

export const getWorkspace = async () => {
  await wait();
  return { business: clone(state.business), global: null };
};

export const listItems = async () => (await wait(), clone(state.items));

export const getUsage = async () => {
  await wait();
  const t = now();
  const month = eatMonthKey(t);
  return {
    month,
    activeOffers: state.offers.filter((o) => isCountedOffer(o, t)).length,
    flashMonth: state.flash.filter((f) => isCountedFlash(f) && eatMonthKey(f.starts_at) === month).length,
    flashRunning: state.flash.filter((f) => isCountedFlash(f) && toMs(f.starts_at) <= t && toMs(f.ends_at) > t).length,
    galleryPhotos: state.gallery.filter((g) => !g.deleted_at && isCountedRow(g)).length,
  };
};

export const listOffers = async () => (await wait(), clone(state.offers).sort((a, b) => toMs(b.created_at) - toMs(a.created_at)));

export const saveOffer = async (offerId, draft) => {
  await wait();
  must();
  const t = now();
  const errors = validateOfferDraft(draft, { plan: plan(), items: state.items, now: t });
  if (errors.starts_at && /Premium/.test(errors.starts_at)) throw new ApiError("premium_only:schedule");
  if (Object.keys(errors).length) throw new ApiError(errors.ends_at || errors.starts_at ? "invalid_dates" : errors.item_ids ? "item_not_owned" : "invalid_discount");
  const existing = state.offers.find((o) => o.id === offerId);
  const next = {
    id: offerId ?? id("o"),
    business_id: state.business.id,
    title: draft.title.trim(),
    description: draft.description ?? "",
    discount_type: draft.discount_type,
    discount_value: Number(draft.discount_value),
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    banner_path: draft.banner_path ?? null,
    active: draft.active ?? existing?.active ?? true,
    item_ids: [...(draft.item_ids ?? [])],
    admin_status: existing?.admin_status ?? null,
    admin_reason: existing?.admin_reason ?? null,
    removed_by_admin: existing?.removed_by_admin ?? false,
    hidden_by_admin: existing?.hidden_by_admin ?? false,
    created_at: existing?.created_at ?? iso(t),
  };
  const limit = limitsFor(plan()).activeOffers;
  const wasCounted = existing ? isCountedOffer(existing, t) : false;
  if (limit !== null && isCountedOffer(next, t) && !wasCounted && state.offers.filter((o) => o.id !== next.id && isCountedOffer(o, t)).length >= limit) {
    throw new ApiError("limit_reached:offers");
  }
  state.offers = existing ? state.offers.map((o) => (o.id === next.id ? next : o)) : [next, ...state.offers];
  return clone(next);
};

export const deleteOffer = async (offerId) => {
  await wait();
  must();
  state.offers = state.offers.filter((o) => o.id !== offerId);
};

export const listFlash = async () => (await wait(), clone(state.flash).sort((a, b) => toMs(b.starts_at) - toMs(a.starts_at)));

export const createFlash = async (draft) => {
  await wait();
  must();
  const t = now();
  const row = { ...draft, starts_at: draft.starts_at ?? iso(t) };
  const errors = validateFlashDraft(row, { items: state.items, now: t });
  if (Object.keys(errors).length) throw new ApiError(errors.item_id ? "item_not_owned" : errors.ends_at || errors.starts_at ? "invalid_dates" : "invalid_discount");
  const sale = {
    id: id("f"),
    business_id: state.business.id,
    item_id: row.item_id,
    discount_type: row.discount_type,
    discount_value: Number(row.discount_value),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    on_end: row.on_end ?? "keep",
    admin_status: null,
    admin_reason: null,
    removed_by_admin: false,
    hidden_by_admin: false,
    created_at: iso(t),
  };
  const blocked = checkFlashLimits(state.flash, sale, { plan: plan() });
  if (blocked) throw new ApiError(blocked);
  state.flash = [sale, ...state.flash];
  return clone(sale);
};

export const updateFlash = async (flashId, patch) => {
  await wait();
  must();
  const row = state.flash.find((f) => f.id === flashId);
  if (!row) throw new ApiError("not_found");
  if ("on_end" in patch) row.on_end = patch.on_end;
  return clone(row);
};

export const deleteFlash = async (flashId) => {
  await wait();
  must();
  state.flash = state.flash.filter((f) => f.id !== flashId);
};

export const listGallery = async () => (await wait(), clone(state.gallery.filter((g) => !g.deleted_at)).sort((a, b) => a.sort - b.sort));

export const addGalleryPhoto = async ({ blob, width, height, caption, pairId, pairRole }) => {
  await wait();
  must();
  if (pairId && !canPair(state.business.category_id)) throw new ApiError("pair_category");
  const limit = limitsFor(plan()).galleryPhotos;
  if (state.gallery.filter((g) => !g.deleted_at && isCountedRow(g)).length >= limit) throw new ApiError("limit_reached:gallery_photos");
  const rowId = id("g");
  const row = {
    id: rowId, business_id: state.business.id, path: `${state.business.id}/gallery/${rowId}.webp`, url: URL.createObjectURL(blob),
    width, height, caption: caption?.trim() || null, sort: Math.max(-1, ...state.gallery.map((g) => g.sort)) + 1,
    pair_id: pairId ?? null, pair_role: pairRole ?? null, deleted_at: null, admin_status: null, admin_reason: null, removed_by_admin: false, hidden_by_admin: false,
  };
  state.gallery.push(row);
  return clone(row);
};

export const updateGalleryPhoto = async (photoId, patch) => {
  await wait();
  must();
  const row = state.gallery.find((g) => g.id === photoId);
  if (!row) throw new ApiError("not_found");
  if ("caption" in patch) row.caption = patch.caption?.trim() || null;
  return clone(row);
};

export const softDeleteGallery = async (ids) => {
  await wait();
  must();
  for (const row of state.gallery) if (ids.includes(row.id)) row.deleted_at = iso(now());
};

export const restoreGallery = async (ids) => {
  await wait();
  must();
  const limit = limitsFor(plan()).galleryPhotos;
  const live = state.gallery.filter((g) => !g.deleted_at && isCountedRow(g)).length;
  if (live + ids.length > limit) throw new ApiError("limit_reached:gallery_photos");
  for (const row of state.gallery) if (ids.includes(row.id)) row.deleted_at = null;
};

export const purgeGallery = async (photos) => {
  await wait();
  const ids = photos.map((p) => p.id);
  state.gallery = state.gallery.filter((g) => !(ids.includes(g.id) && g.deleted_at));
};

export const reorderGallery = async (ids) => {
  await wait();
  must();
  ids.forEach((gid, i) => {
    const row = state.gallery.find((g) => g.id === gid && !g.deleted_at);
    if (row) row.sort = i;
  });
};

export const listStaff = async () => (await wait(), clone(state.staff).sort((a, b) => a.sort - b.sort));

export const saveStaff = async (staffId, draft) => {
  await wait();
  must();
  const errors = validateStaffDraft(draft);
  if (Object.keys(errors).length) throw new ApiError("invalid_staff");
  const caps = teamCapabilities(plan(), state.business.category_id);
  if ((draft.service_ids ?? []).length && !caps.services) throw new ApiError("premium_only:services");
  if ((draft.service_ids ?? []).some((sid) => !state.items.some((i) => i.id === sid))) throw new ApiError("item_not_owned");
  const existing = state.staff.find((s) => s.id === staffId);
  const next = {
    id: staffId ?? id("s"), business_id: state.business.id, name: draft.name.trim(), role: draft.role?.trim() || null,
    specialties: [...(draft.specialties ?? [])], photo_path: draft.photo_path ?? existing?.photo_path ?? null, photo_url: draft.photo_url ?? existing?.photo_url ?? null,
    service_ids: [...(draft.service_ids ?? [])], sort: existing?.sort ?? state.staff.length,
    admin_status: existing?.admin_status ?? null, admin_reason: existing?.admin_reason ?? null, removed_by_admin: existing?.removed_by_admin ?? false, hidden_by_admin: existing?.hidden_by_admin ?? false,
  };
  state.staff = existing ? state.staff.map((s) => (s.id === next.id ? next : s)) : [...state.staff, next];
  return clone(next);
};

export const deleteStaff = async (staffId) => {
  await wait();
  must();
  state.staff = state.staff.filter((s) => s.id !== staffId);
  state.slots = state.slots.map((s) => (s.staff_id === staffId ? { ...s, staff_id: null } : s));
};

export const listSlots = async () => (await wait(), clone(state.slots));

export const saveSlot = async (slotId, draft) => {
  await wait();
  must();
  const caps = teamCapabilities(plan(), state.business.category_id);
  if (!slotId && plan() !== "premium") throw new ApiError("premium_only:timetable");
  if (!caps.timetableCategory) throw new ApiError("timetable_category");
  const row = { ...draft, id: slotId ?? undefined };
  const errors = validateSlotDraft(row, state.slots, state.staff);
  if (errors.staff_id && findTrainerConflict(state.slots, row)) throw new ApiError("timetable_trainer_no_overlap");
  if (Object.keys(errors).length) throw new ApiError("invalid_slot");
  const existing = state.slots.find((s) => s.id === slotId);
  const next = {
    id: slotId ?? id("t"), business_id: state.business.id, day_of_week: Number(draft.day_of_week), start_time: draft.start_time, end_time: draft.end_time,
    class_name: draft.class_name.trim(), staff_id: draft.staff_id || null,
    admin_status: existing?.admin_status ?? null, admin_reason: existing?.admin_reason ?? null, removed_by_admin: existing?.removed_by_admin ?? false, hidden_by_admin: existing?.hidden_by_admin ?? false,
  };
  state.slots = existing ? state.slots.map((s) => (s.id === next.id ? next : s)) : [...state.slots, next];
  return clone(next);
};

export const deleteSlot = async (slotId) => {
  await wait();
  must();
  state.slots = state.slots.filter((s) => s.id !== slotId);
};

export const uploadImage = async ({ blob, folder }) => {
  await wait();
  must();
  const path = `${state.business.id}/${folder}/${id("img")}.webp`;
  return { path, url: URL.createObjectURL(blob) };
};

export const publicUrl = (path) => path ?? null;

export const seedMock = (patch) => {
  if (patch.admin) {
    for (const key of ["offers", "flash", "gallery", "staff", "slots"]) {
      for (const row of patch.admin[key] ?? []) {
        const target = state[key].find((r) => r.id === row.id);
        if (target) Object.assign(target, row);
      }
    }
  }
};

export const mockState = () => state;
