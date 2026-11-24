// The Saved drawer's data: today's name, picture, price, stock and opening hours for every saved line, in two or three requests however long
// the list. Live: the read-only function public_saved_items (migration 0154); a database without it gets the same answer from public_items
// in chunks of 100. The shape matches items.getDetail (the shape the item page prices from), so lineFor gives the same number everywhere.
import { flashPrice, variantPricing } from "@epicmkt/shared";
import { supabase } from "../applications/supabaseClient";
import { cardOfBusiness, flashParts, pricingOf } from "../flash/shape.js";
import { withTiers } from "../flash/tiers.js";
import { chipsByItem } from "../offers/live.js";
import { CARD_COLUMNS, MISSING_FUNCTION, failure, itemRow, liveEntries, optionsFor, quantityModeFor, tiersFor, unwrap } from "../flash/live.js";
import { emptyOptions } from "@epicmkt/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isLiveId = (id) => UUID.test(String(id ?? ""));
const CHUNK = 100;
const PARALLEL = 4;
const ITEM_COLUMNS = `${CARD_COLUMNS},variants,product_type_id`;
const SHOP_COLUMNS = "id,slug,name,category_id,logo_path,whatsapp,phone,lat,lng,hours,exceptions,timezone,verification_level,town,county";

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));

// Runs `fn` over `list`, at most PARALLEL at a time.
async function pool(list, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  }));
  return out;
}

// { rows, extras } for these ids: the public_items rows that are listed, and per id { options, tiers, redirect }.
async function readRows(ids) {
  if (!ids.length) return { rows: [], extras: new Map() };
  const rpc = await supabase.rpc("public_saved_items", { p_ids: ids });
  if (!rpc.error && Array.isArray(rpc.data)) {
    const rows = [];
    const extras = new Map();
    for (const e of rpc.data) {
      if (e?.item) rows.push(e.item);
      extras.set(e.id, { options: e.options ?? null, tiers: e.tiers ?? null, redirect: e.redirect ?? null });
    }
    return { rows, extras };
  }
  if (rpc.error && !MISSING_FUNCTION.has(rpc.error.code)) throw failure(rpc.error);

  // Fallback: the function is not deployed. Same answer from the public view, then the option and tier reads only for the lines that need them.
  const rows = [];
  for (const part of chunks(ids, CHUNK)) rows.push(...(unwrap(await supabase.from("public_items").select(ITEM_COLUMNS).in("id", part)) ?? []));
  const extras = new Map();
  await pool(rows, async (row) => {
    const [options, tiers] = await Promise.all([row.has_options === true ? optionsFor(row.id) : null, tiersFor(row.id)]);
    extras.set(row.id, { options, tiers, redirect: null });
  });
  const listed = new Set(rows.map((r) => r.id));
  await pool(ids.filter((id) => !listed.has(id)), async (id) => {
    const found = await supabase.rpc("public_item_redirect", { p_item: id });
    const d = found.error ? null : found.data;
    extras.set(id, { options: null, tiers: null, redirect: d && typeof d.itemId === "string" ? d : null });
  });
  return { rows, extras };
}

export async function getSavedLive(ids) {
  const wanted = [...new Set(ids)].filter(isLiveId).slice(0, 200);
  let { rows, extras } = await readRows(wanted);

  // An item the seller merged into another: read the one it points at too, so the line can follow it.
  const redirects = {};
  const targets = [];
  for (const id of wanted) {
    const r = extras.get(id)?.redirect;
    if (r && typeof r.itemId === "string" && !rows.some((row) => row.id === id)) {
      redirects[id] = { itemId: r.itemId, param: typeof r.param === "string" ? r.param : "" };
      if (!wanted.includes(r.itemId)) targets.push(r.itemId);
    }
  }
  if (targets.length) {
    const more = await readRows([...new Set(targets)]);
    rows = [...rows, ...more.rows];
    for (const [k, v] of more.extras) extras.set(k, v);
  }

  const shopIds = [...new Set(rows.map((r) => r.business_id))];
  const shopRows = [];
  for (const part of chunks(shopIds, CHUNK)) shopRows.push(...(unwrap(await supabase.from("public_businesses").select(SHOP_COLUMNS).in("id", part)) ?? []));
  const shops = new Map(shopRows.map((b) => [b.id, b]));

  // Flash prices and offer chips are decoration: if either cannot be read the lines keep their regular prices.
  let live = { now: Date.now(), entries: [] };
  let chips = new Map();
  try { live = await liveEntries(); } catch { /* regular prices */ }
  try { chips = await chipsByItem(); } catch { /* no chips */ }
  const sales = new Map(live.entries.map((e) => [e.item.id, e]));

  const modes = new Map();
  await pool([...new Set(rows.map((r) => r.product_type_id).filter(Boolean))], async (typeId) => modes.set(typeId, await quantityModeFor(typeId)));

  const items = {};
  const cards = {};
  for (const row of rows) {
    const business = shops.get(row.business_id);
    if (!business) continue; // a shop that is not live: its lines are kept and say so
    const item = itemRow(row, business);
    const entry = sales.get(row.id);
    const discount = entry?.sale?.discount;
    const pricing = entry
      ? { ...entry.pricing, variants: variantPricing(item.variants, (price) => flashPrice(discount.type, discount.value, price)) }
      : Number.isFinite(item.regularPrice) ? pricingOf(item.regularPrice, item.regularPrice, item.priceType, item.unit, item.variants) : null;
    const card = cardOfBusiness(business, null);
    cards[business.id] = { ...card, county: business.county ?? "" };
    const x = extras.get(row.id) ?? {};
    const options = x.options && Array.isArray(x.options.options) && Array.isArray(x.options.optionVariants) ? { ...emptyOptions(), ...x.options } : emptyOptions();
    const mode = modes.get(row.product_type_id);
    items[row.id] = withTiers({
      ...item,
      ...options,
      ...(mode ? { quantityMode: mode } : {}),
      business: card,
      pricing,
      flash: entry ? flashParts(entry, live.now) : null,
      offer: chips.get(row.id) ?? null
    }, x.tiers);
  }
  // An id that came back unlisted (or whose shop is not live) is null: the drawer says "No longer available" and keeps the line.
  for (const id of wanted) if (!(id in items) && !redirects[id]) items[id] = null;
  return { items, redirects, shops: cards, now: live.now, fetchedAt: Date.now() };
}
