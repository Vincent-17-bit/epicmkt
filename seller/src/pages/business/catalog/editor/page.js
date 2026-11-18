import { brandPayload, checkItemDelivery, checkNotices, deliveryForm, galleryPayload, PAGE_LIMITS, splitInclude } from "@epicmkt/shared";

// The page sections of the editor (migration 0138): delivery for this item, notes buyers must see, the 5-picture gallery and From the brand.
// The form keeps them under `page`. A picture is { mediaId } (saved) or { pending: key } (chosen on this device, uploaded on Save):
// see useExtras.js. "What's included" photos stay in `includeMedia` (one per line) and may be either as well, or { tile } (a photo still
// uploading among the item's photos).

export const emptyPage = () => ({ delivery: deliveryForm(null), notices: [], gallery: [], brand: { banner: null, cards: [] } });

export const pageOf = (item) => ({
  delivery: deliveryForm(item?.delivery ?? null),
  notices: (item?.notices ?? []).map((n) => ({ tone: n.tone ?? "info", title: n.title ?? "", text: n.text ?? "" })),
  gallery: (item?.gallery ?? []).map((g) => ({ mediaId: g.id, label: g.label ?? "", caption: g.caption ?? "" })),
  brand: {
    banner: item?.brandPage?.banner ? { mediaId: item.brandPage.banner } : null,
    cards: (item?.brandPage?.cards ?? []).map((c) => ({ mediaId: c.id, caption: c.caption ?? "" }))
  }
});

/** Every picture of the form still waiting to upload, as its pending key. */
export const pendingKeys = (form) => {
  const p = form.page ?? emptyPage();
  return [
    ...(form.includeMedia ?? []).map((x) => x?.pending),
    ...p.gallery.map((g) => g?.pending),
    p.brand?.banner?.pending,
    ...(p.brand?.cards ?? []).map((c) => c?.pending)
  ].filter(Boolean);
};

const resolve = (ref, ids) => ref?.mediaId ?? (ref?.pending ? ids.extra?.[ref.pending] ?? null : ref?.tile ? ids.tile?.[ref.tile] ?? null : null);

/**
 * What seller_set_item_page is sent. `ids`: { extra: { pendingKey: id }, tile: { tileKey: id } } for pictures that got their id on this Save.
 * `includes`: send the "What's included" photos too (only when the form has or had any). A picture that did not upload is left out.
 */
export function pagePayload(form, ids = {}, { includes = false } = {}) {
  const p = form.page ?? emptyPage();
  const delivery = checkItemDelivery(p.delivery);
  const notices = checkNotices(p.notices);
  const out = {
    delivery: delivery.ok ? delivery.value : null,
    notices: notices.value,
    gallery: galleryPayload(p.gallery.map((g) => ({ ...g, mediaId: resolve(g, ids) }))),
    brand: brandPayload({
      banner: p.brand?.banner ? { mediaId: resolve(p.brand.banner, ids) } : null,
      cards: (p.brand?.cards ?? []).map((c) => ({ ...c, mediaId: resolve(c, ids) }))
    })
  };
  if (includes) {
    out.includeMedia = form.includes.flatMap((text, i) => (String(text ?? "").trim() ? [resolve(form.includeMedia?.[i], ids)] : []));
  }
  return out;
}

const NOTICE_TEXT = { required: "Fill this in", too_long: "Too long" };
const DELIVERY_TEXT = {
  invalid_fee: "Enter the fee in shillings, like 150. Use 0 for free delivery, or leave it empty.",
  area_too_long: `Keep the area under ${PAGE_LIMITS.delivery.area} characters.`,
  time_too_long: `Keep the delivery time under ${PAGE_LIMITS.delivery.time} characters.`,
  notes_too_long: `Keep the notes under ${PAGE_LIMITS.delivery.notes} characters.`
};

/** Problems in the page sections and in the "What's included" names, in the shape the editor's error list reads. */
export function pageErrors(form) {
  const out = {};
  const p = form.page ?? emptyPage();
  const delivery = checkItemDelivery(p.delivery);
  if (!delivery.ok) out.delivery = Object.fromEntries(Object.entries(delivery.errors).map(([k, code]) => [k, DELIVERY_TEXT[code] ?? "Check this"]));
  const notices = checkNotices(p.notices);
  if (!notices.ok) {
    const rows = {};
    notices.errors.forEach((e, i) => { if (e) rows[i] = Object.fromEntries(Object.entries(e).map(([k, code]) => [k, NOTICE_TEXT[code] ?? code])); });
    if (Object.keys(rows).length) out.notices = rows;
  }
  // A picture or details without a name: the name is what buyers read in bold, so it is required.
  const inc = {};
  form.includes.forEach((line, i) => {
    const raw = String(line ?? "");
    const pic = form.includeMedia?.[i];
    // The name as buyers will read it (whatever bold or bullets were typed), and whether anything was typed after the colon.
    const hasName = splitInclude(rawName(raw)).name !== "";
    const hasDetails = rawDetails(raw).trim() !== "";
    if (pic && !hasName) inc[i] = "Give this picture a name, like \"Remote control\".";
    else if (!hasName && hasDetails) inc[i] = "Add a name before the details.";
  });
  if (Object.keys(inc).length) out.includes = inc;
  return out;
}

// The editor keeps a "What's included" line as typed: "Name: details". These split and join it without trimming, so typing never jumps.
export const rawName = (line) => {
  const s = String(line ?? "");
  const at = s.indexOf(":");
  return at < 0 ? s : s.slice(0, at);
};
export const rawDetails = (line) => {
  const s = String(line ?? "");
  const at = s.indexOf(":");
  return at < 0 ? "" : s.slice(at + 1).replace(/^ /, "");
};
export const rawJoin = (name, details) => {
  const n = String(name ?? "").replace(/:/g, " -");
  return details ? `${n}: ${details}` : n;
};
