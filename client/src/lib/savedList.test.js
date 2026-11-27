import { describe, expect, it, vi } from "vitest";
import { createSavedList, lineKey, SAVED_KEY } from "./savedList.js";

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  const s = {
    data,
    fail: false,
    getItem: (k) => (k in data ? data[k] : null),
    setItem(k, v) {
      if (s.fail) throw new Error("QuotaExceeded");
      data[k] = String(v);
    },
    removeItem: (k) => delete data[k]
  };
  return s;
};

let clock = 1000;
const now = () => (clock += 10);
const make = (storage = fakeStorage(), extra = {}) => ({ storage, list: createSavedList({ storage, now, ...extra }) });
const entry = (n, over = {}) => ({ itemId: `item-${n}`, businessId: "shop-1", businessSlug: "shop-one", kind: "product", qty: 1, snap: { name: `Item ${n}`, unit: 100 * n }, ...over });
const stored = (storage) => JSON.parse(storage.data[SAVED_KEY]);

describe("savedList", () => {
  it("adds newest first and writes the documented shape", () => {
    const { storage, list } = make();
    list.add(entry(1));
    list.add(entry(2));
    expect(list.list().map((e) => e.itemId)).toEqual(["item-2", "item-1"]);
    const doc = stored(storage);
    expect(doc.v).toBe(1);
    expect(doc.entries[0]).toMatchObject({ key: "item-2|", itemId: "item-2", businessId: "shop-1", qty: 1, optionParam: "" });
    expect(list.count()).toBe(2);
  });

  it("the same item with two options is two lines; has() tells them apart", () => {
    const { list } = make();
    list.add(entry(1, { optionParam: "walnut", optionLabel: "Walnut" }));
    list.add(entry(1, { optionParam: "oak", optionLabel: "Oak" }));
    expect(list.count()).toBe(2);
    expect(list.has("item-1")).toBe(true);
    expect(list.has("item-1", "walnut")).toBe(true);
    expect(list.has("item-1", "")).toBe(false);
  });

  it("adding a line that exists only refreshes updatedAt", () => {
    const { list } = make();
    list.add(entry(1, { qty: 3 }));
    const before = list.list()[0];
    const res = list.add(entry(1, { qty: 9 }));
    expect(res).toMatchObject({ ok: true, added: false });
    expect(list.count()).toBe(1);
    expect(list.list()[0].qty).toBe(3);
    expect(list.list()[0].updatedAt).toBeGreaterThan(before.updatedAt);
    expect(list.list()[0].savedAt).toBe(before.savedAt);
  });

  it("removes and restores a line in its place", () => {
    const { list } = make();
    [1, 2, 3].forEach((n) => list.add(entry(n)));
    const { entry: gone, position } = list.remove(lineKey("item-2"));
    expect(list.list().map((e) => e.itemId)).toEqual(["item-3", "item-1"]);
    list.restore(gone, position);
    expect(list.list().map((e) => e.itemId)).toEqual(["item-3", "item-2", "item-1"]);
    expect(list.remove("nope")).toBeNull();
  });

  it("changes a quantity", () => {
    const { list } = make();
    list.add(entry(1));
    list.setQty("item-1|", 4);
    expect(list.list()[0].qty).toBe(4);
    expect(list.setQty("item-1|", 0)).toBe(false);
  });

  it("setOption moves a line to its option, or merges into one that already exists", () => {
    const { list } = make();
    list.add(entry(1));
    expect(list.setOption("item-1|", "walnut", "Walnut")).toEqual({ key: "item-1|walnut", merged: false });
    expect(list.list()[0]).toMatchObject({ key: "item-1|walnut", optionParam: "walnut", optionLabel: "Walnut" });
    list.add(entry(1));
    expect(list.count()).toBe(2);
    expect(list.setOption("item-1|", "walnut", "Walnut")).toEqual({ key: "item-1|walnut", merged: true });
    expect(list.count()).toBe(1);
  });

  it("stops at 200 lines with reason full, and never drops anything to make room", () => {
    const { list } = make();
    for (let i = 0; i < 200; i += 1) expect(list.add(entry(i)).ok).toBe(true);
    expect(list.add(entry(999))).toEqual({ ok: false, reason: "full" });
    expect(list.count()).toBe(200);
    expect(list.has("item-0")).toBe(true);
  });

  it("clears and restores everything", () => {
    const { list } = make();
    [1, 2].forEach((n) => list.add(entry(n)));
    const was = list.clear();
    expect(list.count()).toBe(0);
    list.restoreAll(was);
    expect(list.list().map((e) => e.itemId)).toEqual(["item-2", "item-1"]);
  });

  it("two tabs never overwrite each other", () => {
    const storage = fakeStorage();
    const a = createSavedList({ storage, now });
    const b = createSavedList({ storage, now });
    a.add(entry(1));
    b.add(entry(2)); // b's memory was stale; it re-reads before writing
    expect(stored(storage).entries.map((e) => e.itemId).sort()).toEqual(["item-1", "item-2"]);
    a.refresh();
    expect(a.count()).toBe(2);
  });

  it("listens for the storage event and tells subscribers when another tab changes the list", () => {
    const storage = fakeStorage();
    const target = new EventTarget();
    const a = createSavedList({ storage, now, target });
    const other = createSavedList({ storage, now });
    const spy = vi.fn();
    a.subscribe(spy);
    other.add(entry(1));
    target.dispatchEvent(Object.assign(new Event("storage"), { key: SAVED_KEY }));
    expect(spy).toHaveBeenCalled();
    expect(a.count()).toBe(1);
    spy.mockClear();
    target.dispatchEvent(Object.assign(new Event("storage"), { key: "something-else" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps one backup of corrupt text, starts empty, and never overwrites an existing backup", () => {
    const storage = fakeStorage({ [SAVED_KEY]: "{not json" });
    const list = createSavedList({ storage, now });
    expect(list.count()).toBe(0);
    expect(storage.data[`${SAVED_KEY}.bak`]).toBe("{not json");
    expect(storage.data[SAVED_KEY]).toBe("{not json"); // a read alone writes nothing
    storage.data[SAVED_KEY] = "{also bad";
    createSavedList({ storage, now });
    expect(storage.data[`${SAVED_KEY}.bak`]).toBe("{not json");
  });

  it("drops invalid entries in memory only; a read never writes a shorter list back", () => {
    const good = { itemId: "a", businessId: "b", qty: 2, optionParam: "" };
    const text = JSON.stringify({ v: 1, entries: [good, { itemId: "x" }, null, 5] });
    const storage = fakeStorage({ [SAVED_KEY]: text });
    const list = createSavedList({ storage, now });
    expect(list.list().map((e) => e.itemId)).toEqual(["a"]);
    expect(storage.data[SAVED_KEY]).toBe(text);
  });

  it("reads a newer version but never writes it", () => {
    const text = JSON.stringify({ v: 2, entries: [{ itemId: "a", businessId: "b", qty: 1 }], future: true });
    const storage = fakeStorage({ [SAVED_KEY]: text });
    const list = createSavedList({ storage, now });
    expect(list.count()).toBe(1);
    expect(list.status().readOnly).toBe(true);
    list.add(entry(5));
    list.remove("a|");
    expect(storage.data[SAVED_KEY]).toBe(text);
  });

  it("a failed write keeps the list in memory, flags it, and retries on the next change", () => {
    const storage = fakeStorage();
    const list = createSavedList({ storage, now });
    storage.fail = true;
    list.add(entry(1));
    expect(list.count()).toBe(1);
    expect(list.status().writeFailed).toBe(true);
    expect(list.getSnapshot().writeFailed).toBe(true);
    list.add(entry(2)); // memory is the truth while storage is behind
    expect(list.count()).toBe(2);
    storage.fail = false;
    list.add(entry(3));
    expect(stored(storage).entries).toHaveLength(3);
    expect(list.status().writeFailed).toBe(false);
  });

  it("works with no storage at all", () => {
    const list = createSavedList({ storage: null, now });
    list.add(entry(1));
    expect(list.count()).toBe(1);
    expect(list.status().writeFailed).toBe(true);
  });

  it("asks the browser to keep the data once, after the first successful save", () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal("navigator", { storage: { persist } });
    const { list } = make();
    list.add(entry(1));
    list.add(entry(2));
    expect(persist).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("remembers when a shop was sent its list, beside the entries, without changing them", () => {
    const { storage, list } = make();
    list.add(entry(1));
    list.markSent("shop-1", 555);
    expect(list.sentAt("shop-1")).toBe(555);
    expect(stored(storage).sentAt).toEqual({ "shop-1": 555 });
    expect(list.count()).toBe(1);
  });

  it("nothing expires: old, unavailable-looking entries stay for ever", () => {
    const old = { itemId: "ancient", businessId: "b", qty: 1, savedAt: 1, updatedAt: 1 };
    const storage = fakeStorage({ [SAVED_KEY]: JSON.stringify({ v: 1, entries: [old] }) });
    const list = createSavedList({ storage, now: () => 9e15 });
    list.add(entry(1));
    expect(list.has("ancient")).toBe(true);
  });
});
