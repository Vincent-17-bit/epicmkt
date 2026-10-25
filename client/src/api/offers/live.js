import { chipOf, dealOf, liveOffers, offerAvailableNow, offerProductCount, offersByItem } from "@epicmkt/shared";
import { supabase } from "../applications/supabaseClient";
import { cardOfBusiness, mediaUrl } from "../flash/shape.js";
import { isSynced, serverNow } from "../../lib/clock.js";

// Shop and product offers from the public_offers view. Customers read nothing else: the view already hides anything that is
// switched off, outside its window, hidden by an admin, or on no product they can see.
const PAGE = 1000;
const MAX_PAGES = 10;
const TTL_MS = 5000;

const failure = (error) => Object.assign(new Error(error?.message || "request_failed"), { name: "OffersApiError", code: error?.code ?? null });
const unwrap = ({ data, error }) => {
  if (error) throw failure(error);
  return data;
};

export const offerOf = (row) => ({
  id: row.id,
  businessId: row.business_id,
  scope: row.scope === "store" ? "store" : "product",
  title: row.title,
  description: row.description ?? null,
  kind: row.kind,
  config: row.config ?? {},
  conditions: row.conditions ?? {},
  chipText: row.chip_text ?? null,
  code: row.code ?? null,
  terms: row.terms ?? null,
  startsAt: row.starts_at ?? null,
  endsAt: row.ends_at ?? null,
  createdAt: row.created_at,
  active: true,
  items: (Array.isArray(row.items) ? row.items : []).map((entry) => ({ itemId: entry.item_id, role: entry.role === "with" ? "with" : "main" }))
});

const fetchPaged = async (table, columns, filter) => {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    let query = supabase.from(table).select(columns).order("id");
    if (filter) query = filter(query);
    const data = unwrap(await query.range(from, from + PAGE - 1)) ?? [];
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
};

let cache = null;
let inflight = null;
let generation = 0;

export function invalidateOffers() {
  generation += 1;
  cache = null;
  inflight = null;
}

const nowMs = () => (isSynced() ? serverNow() : Date.now());

/** Every offer showing now, whatever the failure: offers are decoration, a store and its products still render without them. */
export async function loadOffers() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (inflight) return inflight;
  const started = generation;
  const promise = fetchPaged("public_offers", "*")
    .then((rows) => rows.map(offerOf))
    .catch(() => [])
    .then((value) => {
      if (started === generation) cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      if (inflight === promise) inflight = null;
    });
  inflight = promise;
  return promise;
}

/** The running offers, newest data, for one store. */
export async function storeOffers(businessId) {
  const at = nowMs();
  return liveOffers((await loadOffers()).filter((offer) => offer.businessId === businessId), at);
}

/** itemId -> small chip { id, label, extra } for the products of one store (or every store) that have an offer. */
export async function chipsByItem(businessId = null) {
  const at = nowMs();
  const all = await loadOffers();
  const map = offersByItem(businessId ? all.filter((o) => o.businessId === businessId) : all);
  const chips = new Map();
  for (const [itemId, list] of map) {
    const chip = chipOf(list, at);
    if (chip) chips.set(itemId, { id: chip.top.id, label: chip.label, extra: chip.extra });
  }
  return chips;
}

/** businessId -> number of products with a running offer (what a store card's chip counts). */
export async function productCounts() {
  const at = nowMs();
  const byBusiness = new Map();
  for (const offer of await loadOffers()) byBusiness.set(offer.businessId, [...(byBusiness.get(offer.businessId) ?? []), offer]);
  return new Map([...byBusiness].map(([id, list]) => [id, offerProductCount(list, at)]));
}

const productOf = (row, role) => ({
  id: row.id,
  name: row.name,
  imageUrl: mediaUrl(row.image_paths?.[0]),
  price: row.price === null || row.price === undefined ? null : Number(row.price),
  role
});

const productsFor = async (ids) => {
  if (!ids.length) return new Map();
  const rows = unwrap(await supabase.from("public_items").select("id,name,price,image_paths").in("id", ids)) ?? [];
  return new Map(rows.map((row) => [row.id, row]));
};

const productsOfOffer = (offer, byId) => offer.items.map((entry) => (byId.has(entry.itemId) ? productOf(byId.get(entry.itemId), entry.role) : null)).filter(Boolean);

const label = (products, scope = "product") => (scope === "store" ? "Whole shop" : products.length === 0 ? "" : products.length <= 2 ? products.map((p) => p.name).join(" + ") : `${products[0].name} + ${products.length - 1} more`);

const viewOf = (offer, products, business, at) => ({
  offer,
  business,
  remainingMs: offer.endsAt ? Math.max(0, Date.parse(offer.endsAt) - at) : null,
  appliesToLabel: label(products, offer.scope),
  products,
  availableNow: offerAvailableNow(offer, at)
});

/** The offers on one product, as the views the product page prints. */
export async function viewsForItem(itemId, businessId, businessCard) {
  const at = nowMs();
  const list = liveOffers((await storeOffers(businessId)).filter((o) => o.items.some((entry) => entry.itemId === itemId)), at);
  if (!list.length) return [];
  const byId = await productsFor([...new Set(list.flatMap((o) => o.items.map((e) => e.itemId)))]);
  return list.map((offer) => viewOf(offer, productsOfOffer(offer, byId), businessCard, at));
}

/** The deals a store's page prints, already worded. */
export async function dealsForStore(businessId) {
  const at = nowMs();
  const list = await storeOffers(businessId);
  if (!list.length) return [];
  const byId = await productsFor([...new Set(list.flatMap((o) => o.items.map((e) => e.itemId)))]);
  return list.map((offer) => dealOf(offer, productsOfOffer(offer, byId), at));
}

const SORTS = {
  ending: (a, b) => (a.offer.endsAt ? Date.parse(a.offer.endsAt) : Infinity) - (b.offer.endsAt ? Date.parse(b.offer.endsAt) : Infinity),
  nearest: (a, b) => (a.business.distanceKm ?? Infinity) - (b.business.distanceKm ?? Infinity) || SORTS.ending(a, b),
  newest: (a, b) => Date.parse(b.offer.createdAt) - Date.parse(a.offer.createdAt)
};

const businessesFor = async (ids) => {
  if (!ids.length) return new Map();
  const rows = unwrap(await supabase.from("public_businesses").select("*").in("id", ids)) ?? [];
  return new Map(rows.map((row) => [row.id, row]));
};

/** The /offers page: every running offer with its store, filterable. */
export async function list({ businessId = null, itemId = null, categoryId = null, town = null, sort = "ending", limit = 20, offset = 0, origin = null } = {}) {
  const at = nowMs();
  let offers = liveOffers(await loadOffers(), at);
  if (businessId) offers = offers.filter((o) => o.businessId === businessId);
  if (itemId) offers = offers.filter((o) => o.items.some((entry) => entry.itemId === itemId));
  const businesses = await businessesFor([...new Set(offers.map((o) => o.businessId))]);
  const cards = new Map([...businesses].map(([id, row]) => [id, cardOfBusiness(row, origin)]));
  let rows = offers.filter((o) => cards.has(o.businessId));
  if (categoryId) rows = rows.filter((o) => cards.get(o.businessId).categoryId === categoryId);
  if (town) rows = rows.filter((o) => cards.get(o.businessId).townSlug === town);
  const page = rows.slice();
  const byId = await productsFor([...new Set(page.flatMap((o) => o.items.map((e) => e.itemId)))]);
  const views = page.map((offer) => viewOf(offer, productsOfOffer(offer, byId), cards.get(offer.businessId), at)).filter((view) => view.offer.scope === "store" || view.products.length > 0);
  views.sort(SORTS[sort] ?? SORTS.ending);
  return { items: views.slice(offset, offset + limit), total: views.length, serverNow: new Date(at).toISOString() };
}

export async function facets() {
  const at = nowMs();
  const offers = liveOffers(await loadOffers(), at);
  const businesses = await businessesFor([...new Set(offers.map((o) => o.businessId))]);
  const categories = new Map();
  const towns = new Map();
  let total = 0;
  for (const offer of offers) {
    const row = businesses.get(offer.businessId);
    if (!row) continue;
    const card = cardOfBusiness(row, null);
    total += 1;
    categories.set(card.categoryId, (categories.get(card.categoryId) ?? 0) + 1);
    const town = towns.get(card.townSlug) ?? { slug: card.townSlug, name: card.townName, count: 0 };
    town.count += 1;
    towns.set(card.townSlug, town);
  }
  return {
    total,
    categories: [...categories].map(([id, count]) => ({ id, count })),
    towns: [...towns.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}
