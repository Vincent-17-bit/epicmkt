// Chooses what the home page's featured section shows. The data layer hands over a pool of candidates (a random
// window of a store's products, a shuffled set of featured stores); this picks from it so that what has not been
// shown lately comes first, ties are broken at random, and nothing is ever the same two visits running.

export const SHOWCASE_PRODUCTS = 4;
export const PRODUCT_POOL = 24;
export const FEATURED_COUNT = 8;
export const FEATURED_POOL = 24;

const SOLD_OUT = new Set(["out_of_stock", "unavailable"]);

/**
 * The one key a product is tracked by. Live products have a unique id of their own (a database uuid), which is the
 * key. Demo products are named after themselves, so the same id can repeat across stores; pairing it with its store
 * keeps two different products from ever sharing a key.
 */
export const productKey = (item) => (item.businessId ? `${item.businessId}:${item.id}` : String(item.id));

/**
 * Orders `pool` by (tier, how long ago it was shown, random) and returns the first `count`.
 * A lower tier always wins. Within a tier, never-shown things come first, then the longest ago. Things shown
 * together share a timestamp, so they stay tied and are shuffled among themselves.
 */
export function pickFresh(pool, { count, lastSeen = () => 0, tier = () => 0, idOf = (x) => x.id, rng = Math.random } = {}) {
  const seen = new Set();
  return (pool ?? [])
    .filter((entry) => {
      const id = idOf(entry);
      if (id == null || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((entry) => ({ entry, tier: tier(entry), at: lastSeen(idOf(entry)), r: rng() }))
    .sort((a, b) => a.tier - b.tier || a.at - b.at || a.r - b.r)
    .slice(0, count)
    .map((row) => row.entry);
}

/** Products that have a picture and are in stock come first; sold-out ones only when nothing better is left. */
export const productTier = (item) => (item.imageUrl ? (SOLD_OUT.has(item.availability) ? 1 : 0) : 2);

export const pickProducts = (pool, { seen, count = SHOWCASE_PRODUCTS, rng } = {}) =>
  pickFresh(pool, { count, rng, idOf: productKey, tier: productTier, lastSeen: (key) => seen?.lastSeen("p", key) ?? 0 });

export const pickStores = (pool, { seen, count = FEATURED_COUNT, rng } = {}) =>
  pickFresh(pool, { count, rng, lastSeen: (id) => seen?.lastSeen("b", id) ?? 0 });

/**
 * Remembers which products it chose for each store, so a store's card does not reshuffle when more stores load
 * beside it. `commit()` records everything chosen as shown, once.
 */
export function createShowcasePicker({ seen, rng = Math.random } = {}) {
  const chosen = new Map();
  const committed = new Set();
  return {
    productsFor(storeId, pool) {
      if (!chosen.has(storeId)) chosen.set(storeId, pickProducts(pool, { seen, rng }));
      return chosen.get(storeId);
    },
    commit() {
      const fresh = [...chosen.values()].flat().map(productKey).filter((key) => !committed.has(key));
      fresh.forEach((id) => committed.add(id));
      seen?.mark("p", fresh);
    }
  };
}
