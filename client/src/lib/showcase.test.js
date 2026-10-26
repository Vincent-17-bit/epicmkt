import { describe, expect, it } from "vitest";
import { createSeen } from "./seen.js";
import { createShowcasePicker, pickFresh, pickProducts, pickStores, productKey, productTier } from "./showcase.js";

const product = (id, over = {}) => ({ id, name: id, imageUrl: `/${id}.jpg`, availability: "available", ...over });
const memory = (now = () => 1) => createSeen({ storage: null, now });

// A deterministic stand-in for Math.random.
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("pickFresh", () => {
  it("puts things never shown ahead of things shown, and the longest ago first", () => {
    const stamps = { a: 30, b: 10, c: 0, d: 20 };
    const out = pickFresh(["a", "b", "c", "d"].map((id) => ({ id })), { count: 4, lastSeen: (id) => stamps[id] });
    expect(out.map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("shuffles among things that tie, so the same pool does not give the same order twice", () => {
    const pool = ["a", "b", "c"].map((id) => ({ id }));
    const one = pickFresh(pool, { count: 3, rng: sequence(0.9, 0.1, 0.5) }).map((x) => x.id);
    const two = pickFresh(pool, { count: 3, rng: sequence(0.1, 0.9, 0.5) }).map((x) => x.id);
    expect(one).toEqual(["b", "c", "a"]);
    expect(two).toEqual(["a", "c", "b"]);
  });

  it("returns fewer when the pool is small, and nothing for an empty or missing pool", () => {
    expect(pickFresh([{ id: 1 }], { count: 4 })).toHaveLength(1);
    expect(pickFresh([], { count: 4 })).toEqual([]);
    expect(pickFresh(undefined, { count: 4 })).toEqual([]);
  });

  it("never picks the same id twice", () => {
    expect(pickFresh([{ id: "a" }, { id: "a" }, { id: "b" }], { count: 4 })).toHaveLength(2);
  });
});

describe("pickProducts", () => {
  it("prefers products with a picture, even when a bare one was never shown", () => {
    const pool = [product("bare", { imageUrl: null }), product("ok1"), product("ok2"), product("ok3")];
    const seen = memory();
    seen.mark("p", ["ok1", "ok2", "ok3"]);
    const out = pickProducts(pool, { seen, count: 3 }).map((p) => p.id);
    expect(out.sort()).toEqual(["ok1", "ok2", "ok3"]);
    expect(productTier(pool[0])).toBe(2);
    expect(productTier(pool[1])).toBe(0);
  });

  it("rotates: what was shown last time gives way to what was not", () => {
    const pool = Array.from({ length: 12 }, (_, i) => product(`p${i}`));
    const seen = memory();
    const first = pickProducts(pool, { seen, count: 4 }).map((p) => p.id);
    seen.mark("p", first);
    const second = pickProducts(pool, { seen, count: 4 }).map((p) => p.id);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it("copes with a store that has no products", () => {
    expect(pickProducts([], { seen: memory() })).toEqual([]);
  });
});

describe("product keys", () => {
  it("uses a live product's own id, and pairs a demo id with its store so two stores' products never share a key", () => {
    expect(productKey({ id: "p1" })).toBe("p1");
    expect(productKey({ id: "haircut", businessId: "a" })).not.toBe(productKey({ id: "haircut", businessId: "b" }));
  });

  it("treats same-named products from different stores as different products", () => {
    const pool = [product("haircut", { businessId: "a" }), product("haircut", { businessId: "b" })];
    expect(pickProducts(pool, { seen: memory(), count: 4 })).toHaveLength(2);
  });

  it("remembers having shown one store's product without hiding the other store's", () => {
    const seen = memory();
    const picker = createShowcasePicker({ seen });
    picker.productsFor("a", [product("haircut", { businessId: "a" })]);
    picker.commit();
    expect(seen.lastSeen("p", "a:haircut")).toBeGreaterThan(0);
    expect(seen.lastSeen("p", "b:haircut")).toBe(0);
  });
});

describe("pickStores", () => {
  it("favours stores not shown recently so no store is always on top", () => {
    const stores = ["a", "b", "c", "d"].map((id) => ({ id }));
    const seen = memory();
    seen.mark("b", ["a", "b"]);
    const out = pickStores(stores, { seen, count: 2 }).map((s) => s.id).sort();
    expect(out).toEqual(["c", "d"]);
  });
});

describe("createShowcasePicker", () => {
  it("keeps a store's choice stable between renders and records each product once", () => {
    const seen = memory(() => 42);
    const picker = createShowcasePicker({ seen, rng: sequence(0.2, 0.4, 0.6, 0.8, 0.1) });
    const pool = ["a", "b", "c", "d", "e"].map((id) => product(id));
    const first = picker.productsFor("shop", pool);
    expect(picker.productsFor("shop", pool)).toBe(first);
    expect(seen.lastSeen("p", first[0].id)).toBe(0);
    picker.commit();
    expect(seen.lastSeen("p", first[0].id)).toBe(42);
    expect(first).toHaveLength(4);
  });
});
