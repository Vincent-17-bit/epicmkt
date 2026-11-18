// The order of the home feed ("Recommended"): featured shops' products blended in, never lined up at the top; a fresh, random order
// every hour and for every visit; and, for a visitor who is browsing, the same order until they leave.
//
// One implementation, two homes (like productQuery.js): /api/products builds the feed with it over the hour's pool
// (products_feed_pool, migration 0128) or over its snapshot, and the browser uses it as the fallback and in demo mode.
// Pure: no browser, Node or Supabase imports.
//
// How a place is decided
//   1. Rotation hour ("epoch"): whole hours since 1970. The visitor's page asks for the hour their visit started
//      (src/lib/feedEpoch.js), so their order never changes under them; a new visit later gets the new hour.
//   2. Variant: each visit also draws one of FEED_VARIANTS (8) orders for that hour, so two visitors in the same hour do not see
//      the same first product. Eight, not one per visitor, so the CDN still answers every repeat from its cache.
//   3. Only products created before that hour began take part, so a product added while someone pages through the feed can
//      never push the rest of it down. It joins the next hour's order (and shows at once under "Newest first" and in search).
//   4. Score = 80% a random draw (per hour, per variant, per product) + 10% freshness + 10% a complete listing (a picture, a
//      discount, a verified shop). The draw decides almost everything, so any product, however far down a plain list it would
//      sit, can open the feed; the other 20% only nudges the better listings up a little.
//   5. Featured places: on the first page exactly one place of every two (a pair: 1-2, 3-4, ...) goes to a featured shop's
//      product, and WHICH of the two is drawn per pair, so half the first page is featured but a featured product is no more likely
//      to be first than an ordinary one. After the first page, one place in seven, at a drawn position within each seven.
//      No featured product left: the place goes to the next product; no other product left: featured ones fill in.
//   6. Shop variety: a shop appears at most once in any 10 places in a row (looking ahead up to 120 products for another shop).
//      With too few shops for that, the shop shown least recently goes next, so a catalogue of two shops simply alternates.
//   7. Depth: only the first FEED_MAX_PAGES pages exist. Past that the visitor is invited to search, filter or browse a category
//      (shallow pages, like the 7 pages Amazon shows for a keyword or the 2,000-result cap of Jumia).

export const EPOCH_MS = 3_600_000;
export const FEED_PAGE_SIZE = 24;
export const FEED_MAX_PAGES = 8;
// How many different orders one rotation hour has; a visit draws one and keeps it.
export const FEED_VARIANTS = 8;
// A visitor's rotation hour may lag the clock by this much (a long visit); older or future values are clamped.
export const EPOCH_GRACE = 6;

export const epochOf = (ms = Date.now()) => Math.floor(ms / EPOCH_MS);

/** The rotation hour to use for a request: the one asked for, if it is the current hour or a recent one; else the current one. */
export function clampEpoch(asked, now = Date.now()) {
  const current = epochOf(now);
  const n = Number(asked);
  return Number.isInteger(n) && n <= current && n >= current - EPOCH_GRACE ? n : current;
}

/** The variant to use for a request: a whole number from 0 to FEED_VARIANTS - 1, else 0. */
export function clampVariant(asked) {
  const n = Number(asked);
  return Number.isInteger(n) && n >= 0 && n < FEED_VARIANTS ? n : 0;
}

/** The seed of one order: the hour alone for variant 0, hour and variant otherwise. */
export const seedOf = (epoch, variant = 0) => (variant ? `${epoch}.${variant}` : epoch);

/** A stable number in [0, 1) for (seed, id): FNV-1a, so the browser and the server draw the same. */
export function hash01(seed, id) {
  let h = 0x811c9dc5;
  const text = `${seed}:${id}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4_294_967_296;
}

/**
 * Is the place at `index` (0-based, across the whole feed) a featured place? On the first page one of every pair of places is
 * (which one is drawn from `seed`), so half the page is featured and no place is always featured; after it, one in seven.
 */
export function isFeaturedSlot(index, pageSize = FEED_PAGE_SIZE, seed = 0) {
  if (index < pageSize) {
    const firstOfPair = hash01(seed, `pair:${index >> 1}`) < 0.5;
    return index % 2 === 0 ? firstOfPair : !firstOfPair;
  }
  const after = index - pageSize;
  const offset = Math.floor(hash01(seed, `seven:${Math.floor(after / 7)}`) * 7);
  return after % 7 === offset;
}

const shopOf = (p) => p.business?.id ?? p.businessId ?? p.id;
const isFeatured = (p) => p.business?.featured === true;
const hasPicture = (p) => Boolean(p.imagePath || p.imageUrl || p.images?.length);

function scoreOf(p, seed, start) {
  const created = Date.parse(p.createdAt);
  const ageDays = Number.isFinite(created) ? Math.max(0, (start - created) / 86_400_000) : 60;
  const fresh = Math.exp(-ageDays / 14);
  const complete = (hasPicture(p) ? 0.6 : 0) + (p.flash || p.pricing?.savings > 0 ? 0.25 : 0) + (p.business?.verified ? 0.15 : 0);
  return 0.8 * hash01(seed, p.id) + 0.1 * fresh + 0.1 * complete;
}

/**
 * The feed order for one rotation hour and variant: the first `limit` products (all of them by default). The returned array also
 * carries `poolSize`, the number of products the order is drawn from.
 * When fewer than `minPool` products were created before the hour began (a young catalogue), newer ones take part too: a list
 * that short is one page, so nothing can shift under a visitor anyway.
 */
export function blendFeed(
  products,
  { epoch = epochOf(), variant = 0, pageSize = FEED_PAGE_SIZE, limit = Infinity, window = 10, perShop = 1, lookahead = 120, minPool = pageSize } = {}
) {
  const start = epoch * EPOCH_MS;
  const seed = seedOf(epoch, variant);
  const settled = products.filter((p) => !(Date.parse(p.createdAt) >= start));
  const pool = settled.length >= minPool ? settled : products;
  const featured = [];
  const organic = [];
  for (const p of pool) (isFeatured(p) ? featured : organic).push({ p, s: scoreOf(p, seed, start) });
  const byScore = (a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0);
  featured.sort(byScore);
  organic.sort(byScore);
  const queues = { featured: featured.map((x) => x.p), organic: organic.map((x) => x.p) };

  const want = Math.min(limit, pool.length);
  const out = [];
  const recent = [];
  const counts = new Map();
  // The best product in `queue` whose shop is not already shown `perShop` times in the last `window` places. When every shop in
  // reach is, the one shown least recently (fewest times in the window) goes next.
  const take = (queue) => {
    const scan = Math.min(queue.length, lookahead);
    let pick = -1;
    let least = 0;
    let leastCount = Infinity;
    for (let i = 0; i < scan; i += 1) {
      const shown = counts.get(shopOf(queue[i])) ?? 0;
      if (shown < perShop) {
        pick = i;
        break;
      }
      if (shown < leastCount) {
        leastCount = shown;
        least = i;
      }
    }
    return queue.splice(pick >= 0 ? pick : least, 1)[0];
  };
  while (out.length < want) {
    const first = isFeaturedSlot(out.length, pageSize, seed) ? queues.featured : queues.organic;
    const queue = first.length ? first : first === queues.featured ? queues.organic : queues.featured;
    const p = take(queue);
    out.push(p);
    const shop = shopOf(p);
    recent.push(shop);
    counts.set(shop, (counts.get(shop) ?? 0) + 1);
    if (recent.length > window) {
      const gone = recent.shift();
      counts.set(gone, counts.get(gone) - 1);
    }
  }
  // How many products the order is drawn from (without the ones added during the hour), for counting pages.
  out.poolSize = pool.length;
  return out;
}

/** How many pages a list of `total` products offers, capped at `maxPages`. */
export const pagesOf = (total, pageSize = FEED_PAGE_SIZE, maxPages = FEED_MAX_PAGES) => Math.min(Math.max(1, Math.ceil(total / pageSize)), maxPages);
