import { PLAN_FEATURES, cardFacts, normalizeText, slugify } from "@epicmkt/shared";
import { NotFoundError } from "@epicmkt/backend";
import { store } from "@epicmkt/backend/store";
import { supabase } from "../applications/supabaseClient";
import { mediaUrl } from "../flash/shape.js";

const TTL_MS = 60_000;
const MAX_PAGE_SIZE = 100;

const failure = (error) => Object.assign(new Error(error?.message || "request_failed"), { name: "BrowseApiError", code: error?.code ?? null });

const unwrap = ({ data, error }) => {
  if (error) throw failure(error);
  return data;
};

const rpc = async (name, args) => unwrap(await supabase.rpc(name, args));

const finite = (n) => (Number.isFinite(n) ? n : null);

const originArgs = (lat, lng) => (Number.isFinite(lat) && Number.isFinite(lng) ? { p_lat: lat, p_lng: lng } : { p_lat: null, p_lng: null });

const localMeta = new Map(store.categories.map((c) => [c.id, c]));

const buildCategories = (rows) =>
  (rows.length ? rows : store.categories).map((row) => {
    const meta = localMeta.get(row.id);
    return {
      singular: row.name,
      hue: 210,
      blurb: "",
      fields: [],
      ...meta,
      id: row.id,
      name: row.name ?? meta?.name,
      icon: meta?.icon ?? row.icon ?? "store"
    };
  });

const fetchCategories = async () => {
  const rows = unwrap(await supabase.from("categories").select("id,name,icon,sort,active").eq("active", true).order("sort")) ?? [];
  const list = buildCategories(rows);
  return { list, map: new Map(list.map((c) => [c.id, c])) };
};

const memo = (load) => {
  let hit = null;
  let inflight = null;
  let generation = 0;
  const get = () => {
    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
    if (inflight) return inflight;
    const started = generation;
    const promise = load()
      .then((value) => {
        if (started === generation) hit = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        if (inflight === promise) inflight = null;
      });
    inflight = promise;
    return promise;
  };
  get.reset = () => {
    generation += 1;
    hit = null;
    inflight = null;
  };
  return get;
};

const categories = memo(fetchCategories);
const categoryCounts = memo(() => rpc("browse_category_counts", {}));
const towns = memo(() => rpc("browse_towns", {}));
const counties = memo(() => rpc("browse_counties", {}));

export function invalidateBrowseCache() {
  categories.reset();
  categoryCounts.reset();
  towns.reset();
  counties.reset();
}

const toSummary = (row, map) => {
  const category = map.get(row.categoryId) ?? null;
  const town = row.town ?? "";
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    categoryId: row.categoryId,
    categoryName: category?.singular ?? "",
    categoryIcon: category?.icon ?? null,
    county: row.county ?? "",
    area: town,
    townSlug: slugify(town),
    rating: 0,
    reviewCount: 0,
    plan: PLAN_FEATURES[row.plan] ? row.plan : "standard",
    verified: Boolean(row.verified),
    hue: category?.hue ?? 210,
    coverUrl: mediaUrl(row.coverPath),
    logoUrl: mediaUrl(row.logoPath),
    fromPriceKes: row.fromPriceKes === null || row.fromPriceKes === undefined ? null : Number(row.fromPriceKes),
    highlights: cardFacts(category?.fields, {}),
    phone: row.phone,
    whatsapp: row.whatsapp,
    lat: row.lat,
    lng: row.lng,
    isOpen: Boolean(row.isOpen),
    distanceKm: row.distanceKm === null || row.distanceKm === undefined ? null : Number(row.distanceKm),
    promo: { flash: Number(row.promo?.flash) || 0, offers: Number(row.promo?.offers) || 0 }
  };
};

const toSummaries = async (rows) => {
  const { map } = await categories();
  return (rows ?? []).map((row) => toSummary(row, map));
};

const townList = (rows) =>
  [...(rows ?? [])].map((t) => ({ slug: t.slug, name: t.name, county: t.county, count: Number(t.count) })).sort((a, c) => a.name.localeCompare(c.name));

export async function getCategories() {
  const [{ list }, counts] = await Promise.all([categories(), categoryCounts()]);
  const byId = new Map((counts ?? []).map((row) => [row.categoryId, Number(row.count)]));
  return list.map((c) => ({ ...c, count: byId.get(c.id) ?? 0 }));
}

export async function getTowns() {
  return townList(await towns());
}

export async function getCounties() {
  return [...((await counties()) ?? [])];
}

export async function searchBusinesses({
  query = "",
  categoryId = null,
  county = null,
  town = null,
  openNow: onlyOpen = false,
  verifiedOnly = false,
  featuredOnly = false,
  radiusKm = null,
  minPrice = null,
  maxPrice = null,
  minRating = 0,
  sort = "relevance",
  seed = 0,
  lat,
  lng,
  page = 1,
  pageSize = 12
} = {}) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize)) || 1));
  const current = Math.max(1, Math.floor(Number(page)) || 1);
  const [result, { map }] = await Promise.all([
    rpc("browse_search", {
      p_query: normalizeText(query),
      p_category: categoryId || null,
      p_county: county || null,
      p_town: town || null,
      p_open_now: Boolean(onlyOpen),
      p_verified: Boolean(verifiedOnly),
      p_featured: Boolean(featuredOnly),
      p_radius_km: finite(Number(radiusKm)) || null,
      p_min_price: minPrice == null ? null : finite(Number(minPrice)),
      p_max_price: maxPrice == null ? null : finite(Number(maxPrice)),
      p_min_rating: finite(Number(minRating)) ?? 0,
      p_sort: sort,
      p_seed: String(seed ?? 0),
      ...originArgs(lat, lng),
      p_page: current,
      p_page_size: size
    }),
    categories()
  ]);
  const total = Number(result?.total) || 0;
  return {
    items: (result?.items ?? []).map((row) => toSummary(row, map)),
    total,
    page: current,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(total / size))
  };
}

export async function getSearchFacets({ query = "", categoryId = null } = {}) {
  const [facets, { map }] = await Promise.all([rpc("browse_facets", { p_query: normalizeText(query), p_category: categoryId || null }), categories()]);
  const scopedId = facets?.categoryId ?? null;
  const category = scopedId ? map.get(scopedId) ?? null : null;
  const hasPrice = facets?.priceMin !== null && facets?.priceMin !== undefined && facets?.priceMax !== null && facets?.priceMax !== undefined;
  return {
    towns: townList(facets?.towns),
    price: hasPrice ? { min: Number(facets.priceMin), max: Number(facets.priceMax) } : null,
    categoryId: scopedId,
    categoryName: category?.name ?? null,
    fields: []
  };
}

export async function getSuggestions(prefix, limit = 6) {
  if (normalizeText(prefix).length < 2) return [];
  return (await rpc("browse_suggestions", { p_prefix: String(prefix), p_limit: limit })) ?? [];
}

export async function getFeaturedBusinesses({ categoryId = null, limit = 6, lat, lng, seed = null } = {}) {
  const rows = await rpc("browse_featured", {
    p_category: categoryId || null,
    p_limit: limit,
    ...originArgs(lat, lng),
    p_seed: seed == null ? null : String(seed)
  });
  return toSummaries(rows);
}

export async function getNearbyBusinesses({ lat, lng, radiusKm = 10, categoryId = null, limit = 8 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const rows = await rpc("browse_nearby", { p_lat: lat, p_lng: lng, p_radius_km: radiusKm, p_category: categoryId || null, p_limit: limit });
  return toSummaries(rows);
}

export async function getSimilarBusinesses(ref, limit = 4) {
  const { data, error } = await supabase.rpc("browse_similar", { p_ref: String(ref ?? ""), p_limit: limit });
  if (error) {
    if (error.code === "P0002" || /business_not_found/.test(error.message ?? "")) throw new NotFoundError("Business not found");
    throw failure(error);
  }
  return toSummaries(data);
}

export async function getTopSearches(limit = 10) {
  const rows = unwrap(await supabase.rpc("top_searches", { p_limit: limit })) ?? [];
  return rows.map((row) => ({ term: row.term, count: row.count, hot: Boolean(row.hot) }));
}

export async function logSearch(term) {
  try {
    await supabase.rpc("log_search", { p_term: term });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
