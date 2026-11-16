// The order of the home feed ("Recommended"): featured shops' products blended in, never all at the top; a fresh order every
// hour; and, for a visitor who is browsing, the same order until they leave.
//
// One implementation, two homes (like productQuery.js): /api/products builds the feed with it over the hour's pool
// (products_feed_pool, migration 0128) or over its snapshot, and the browser uses it as the fallback and in demo mode.
// Pure: no browser, Node or Supabase imports.
//
// How a place is decided
//   1. Rotation hour ("epoch"): whole hours since 1970. The visitor's page asks for the hour their visit started
//      (src/lib/feedEpoch.js), so their order never changes under them; a new visit later gets the new hour.
//   2. Only products created before that hour began take part, so a product added while someone pages through the feed can
//      never push the rest of it down. It joins the next hour's order (and shows at once under "Newest first" and in search).
//   3. Score = 50% a per-hour random draw + 30% freshness (14-day half-life-ish decay) + 20% a complete listing (a picture, a
//      discount, a verified shop). The draw is why nothing owns the top spot: each product's place changes every hour.
//   4. Featured slots: on the first page 1 place in 5 (the 2nd, 7th, 12th ...), after it 1 in 7. 5 and 7 share no factor with
//      2, 3, 4 or 6, so on any grid width featured cards fall on a diagonal, not in one column. No featured product left: the
//      slot goes to the next product; no other product left: featured ones fill in.
//   5. Variety: at most 2 products of one shop in any 12 places in a row (looking ahead up to 60 places for another shop).
//   6. Depth: only the first FEED_MAX_PAGES pages exist. Past that the visitor is invited to search, filter or browse a category
//      (shallow pages, like the 7 pages Amazon shows for a keyword or the 2,000-result cap of Jumia).

export const EPOCH_MS = 3_600_000;
export const FEED_PAGE_SIZE = 24;
export const FEED_MAX_PAGES = 8;
// A visitor's rotation hour may lag the clock by this much (a long visit); older or future values are clamped.
export const EPOCH_GRACE = 6;

export const epochOf = (ms = Date.now()) => Math.floor(ms / EPOCH_MS);

/** The rotation hour to use for a request: the one asked for, if it is the current hour or a recent one; else the current one. */
export function clampEpoch(asked, now = Date.now()) {
  const current = epochOf(now);
  const n = Number(asked);
  return Number.isInteger(n) && n <= current && n >= current - EPOCH_GRACE ? n : current;
}

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

/** Is the place at `index` (0-based, across the whole feed) a featured place? */
export function isFeaturedSlot(index, pageSize = FEED_PAGE_SIZE) {
  if (index < pageSize) return index % 5 === 1;
  return (index - pageSize) % 7 === 3;
}

const shopOf = (p) => p.business?.id ?? p.businessId ?? p.id;
const isFeatured = (p) => p.business?.featured === true;
const hasPicture = (p) => Boolean(p.imagePath || p.imageUrl || p.images?.length);

function scoreOf(p, epoch, start) {
  const created = Date.parse(p.createdAt);
  const ageDays = Number.isFinite(created) ? Math.max(0, (start - created) / 86_400_000) : 60;
  const fresh = Math.exp(-ageDays / 14);
  const complete = (hasPicture(p) ? 0.6 : 0) + (p.flash || p.pricing?.savings > 0 ? 0.25 : 0) + (p.business?.verified ? 0.15 : 0);
  return 0.5 * hash01(epoch, p.id) + 0.3 * fresh + 0.2 * complete;
}

/**
 * The feed order for one rotation hour: the first `limit` products (all of them by default). The returned array also carries
 * `poolSize`, the number of products the order is drawn from.
 * When fewer than `minPool` products were created before the hour began (a young catalogue), newer ones take part too: a list
 * that short is one or two pages, so nothing can shift under a visitor anyway.
 */
export function blendFeed(products, { epoch = epochOf(), pageSize = FEED_PAGE_SIZE, limit = Infinity, window = 12, perShop = 2, lookahead = 60, minPool = pageSize * 2 } = {}) {
  const start = epoch * EPOCH_MS;
  const settled = products.filter((p) => !(Date.parse(p.createdAt) >= start));
  const pool = settled.length >= minPool ? settled : products;
  const featured = [];
  const organic = [];
  for (const p of pool) (isFeatured(p) ? featured : organic).push({ p, s: scoreOf(p, epoch, start) });
  const byScore = (a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0);
  featured.sort(byScore);
  organic.sort(byScore);
  const queues = { featured: featured.map((x) => x.p), organic: organic.map((x) => x.p) };

  const want = Math.min(limit, pool.length);
  const out = [];
  const recent = [];
  const counts = new Map();
  // The best product in `queue` whose shop is not already shown `perShop` times in the last `window` places.
  const take = (queue) => {
    const scan = Math.min(queue.length, lookahead);
    let pick = 0;
    for (let i = 0; i < scan; i += 1) {
      if ((counts.get(shopOf(queue[i])) ?? 0) < perShop) {
        pick = i;
        break;
      }
    }
    return queue.splice(pick, 1)[0];
  };
  while (out.length < want) {
    const first = isFeaturedSlot(out.length, pageSize) ? queues.featured : queues.organic;
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
