import { comboKey, guidePayload, liveRows, publicOptions } from "@epicmkt/shared";
import { parseKes, stockLeftOf, stockStatusOf } from "./model.js";
import { tiersPayload } from "./model/tiers.js";

// What the live preview sends to the buyer site's /preview/item page: the item as the database would give that page (public_items
// row, the public options payload, the 3D rows), built from the form as it is now. Photos that are not uploaded yet go as the seller's
// own files (Blobs), so the page can show them before they are saved. No React here.

const num = (v) => { const n = parseKes(v); return n === null ? null : n; };
const int = (v) => (/^\d{1,6}$/.test(String(v ?? "").trim()) ? Number(String(v).trim()) : null);
const text = (v) => { const t = String(v ?? "").trim(); return t || null; };

// A photo the form points at, as the page's media id: the saved photo's id, else the tile key of a photo still uploading.
const idOfTile = (tiles, key) => { const t = tiles.find((x) => x.key === key); return t ? t.id ?? t.key : null; };

function optionsOf(form, tiles, price, salePrice) {
  const o = form.options;
  if (!o || !Array.isArray(o.axes) || o.axes.length === 0 || o.axes.some((a) => a.values.length === 0)) return null;
  const axes = o.axes.map((a) => ({
    key: a.key, label: String(a.label ?? "").trim() || "Option", display: a.display ?? "button", ...(a.dependsOn && { dependsOn: a.dependsOn }), ...(a.scale && { scale: a.scale }),
    values: a.values.map((v) => ({ id: v.id, label: v.label, ...(v.color && { color: v.color }), ...(v.mediaId ? { mediaId: v.mediaId } : v.photoTile ? { mediaId: idOfTile(tiles, v.photoTile) } : {}), ...(v.stored && { stored: v.stored }) })),
  }));
  const rows = liveRows(o).filter((r) => r.sold);
  const variants = rows.map((r, i) => {
    const stock = int(r.stock);
    const status = stock === 0 ? "out_of_stock" : stock !== null && stock <= 3 ? "limited_stock" : r.status ?? "available";
    return { id: r.id ?? `pv${i + 1}`, choice: r.choice, price: num(r.price) ?? null, salePrice: num(r.salePrice), stock, status, mediaIds: r.mediaIds ?? [], specs: r.specs ?? [] };
  });
  if (variants.length === 0) return null;
  const def = o.defaultKey ? variants.find((v) => comboKey(axes, v.choice) === o.defaultKey) : null;
  return publicOptions({ axes, variants, item: { price, salePrice, showStockCount: Boolean(form.trackStock && form.showStockCount) }, guide: form.sizeGuide ? guidePayload(form.sizeGuide) : null, defaultVariantId: def?.id ?? null });
}

export function previewPayload({ form, item = null, business = null, shop = null, tiles = [], media3d = [] }) {
  const price = num(form.price);
  const salePrice = num(form.salePrice);
  const status = stockStatusOf(form);
  const media = tiles
    .filter((t) => (t.kind === "image" || t.kind === "video") && !t.removing)
    .map((t) => ({ id: t.id ?? t.key, kind: t.kind, ...(t.path && t.status === "saved" ? { path: t.path } : t.file ? { blob: t.file } : { path: t.path }) }))
    .filter((m) => m.path || m.blob);
  const options = optionsOf(form, tiles, price, salePrice);
  const prices = options ? options.optionVariants.map((v) => v.price).filter((n) => Number.isFinite(n)) : [];
  const includeMedia = (form.includes ?? []).map((_, i) => {
    const p = form.includeMedia?.[i];
    const t = p?.mediaId ? tiles.find((x) => x.id === p.mediaId) : p?.tile ? tiles.find((x) => x.key === p.tile) : null;
    if (!t) return null;
    return t.path && t.status === "saved" ? { path: t.path } : t.file ? { blob: t.file } : null;
  });
  const t = form.priceType === "from" && form.tiers ? tiersPayload(form.tiers, { priceType: form.priceType, had: false }) : null;
  const tiers = t?.priceTiers ? { tiers: t.priceTiers, mode: t.priceTierMode } : null;
  return {
    row: {
      id: item?.id ?? "preview",
      name: text(form.name) ?? "Your item",
      description: text(form.description),
      short_description: text(form.shortDescription),
      brand: text(form.brand),
      section: text(form.section),
      highlights: (form.highlights ?? []).filter((h) => String(h.text ?? "").trim()).map((h) => ({ ...(String(h.title ?? "").trim() && { title: h.title.trim() }), text: h.text.trim() })),
      specs: (form.specs ?? []).filter((s) => String(s.label ?? "").trim() && String(s.value ?? "").trim()).map((s) => ({ group: s.group || "Features & Specs", label: s.label.trim(), value: s.value.trim() })),
      includes: (form.includes ?? []).map((t) => String(t ?? "").trim()).filter(Boolean),
      include_media: (form.includes ?? []).flatMap((t, i) => (String(t ?? "").trim() ? [includeMedia[i]] : [])),
      terms: text(form.terms),
      pack_size: text(form.packSize),
      price: ["fixed", "from", "range"].includes(form.priceType) ? price : null,
      price_type: form.priceType,
      unit: text(form.unit),
      availability: status,
      stock_left: status === "limited_stock" ? stockLeftOf(form) : null,
      variants: [],
      has_options: Boolean(options),
      option_count: options ? options.optionVariants.length : 0,
      price_min: prices.length ? Math.min(...prices) : null,
      price_high: prices.length ? Math.max(...prices) : null,
      created_at: item?.createdAt ?? new Date().toISOString(),
    },
    business: { id: business?.id ?? null, slug: shop?.slug ?? "", name: business?.name ?? "Your shop", logo_path: business?.logoPath ?? null, category: null },
    options,
    tiers,
    media,
    media3d,
  };
}
