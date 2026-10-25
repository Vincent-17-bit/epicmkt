import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, pack, unpack } from "./redis.js";

const WINDOW = { freshMs: 30_000, staleMs: 600_000 };

function fakeRedis({ down = false } = {}) {
  const store = new Map();
  const calls = [];
  vi.stubGlobal("fetch", async (_url, init) => {
    const [name, key, value] = JSON.parse(init.body);
    calls.push(name);
    if (down) return new Response("no", { status: 500 });
    if (name === "GET") return Response.json({ result: store.get(key) ?? null });
    store.set(key, value);
    return Response.json({ result: "OK" });
  });
  return { store, calls };
}

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("shared snapshot cache", () => {
  it("round-trips a large payload through gzip and shrinks it", async () => {
    const value = { rows: Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `Product ${i}`, price: i * 3 })) };
    const text = await pack(value);
    expect(await unpack(text)).toEqual(value);
    expect(text.length).toBeLessThan(JSON.stringify(value).length / 3);
  });

  it("loads once, then serves the shared copy", async () => {
    const redis = fakeRedis();
    const load = vi.fn(async () => ({ a: 1 }));
    const first = await cached("k", WINDOW, load);
    const second = await cached("k", WINDOW, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(redis.calls).toEqual(["GET", "SET", "GET"]);
  });

  it("keeps the original build time so staleness never stacks", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fakeRedis();
    const load = vi.fn(async () => ({ a: 1 }));
    const first = await cached("k", WINDOW, load);
    vi.setSystemTime(Date.now() + 20_000);
    expect((await cached("k", WINDOW, load)).at).toBe(first.at);
    vi.setSystemTime(Date.now() + 11_000);
    const rebuilt = await cached("k", WINDOW, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(rebuilt.at).toBeGreaterThan(first.at);
  });

  it("serves the older shared copy when the database fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fakeRedis();
    const first = await cached("k", WINDOW, async () => ({ a: 1 }));
    vi.setSystemTime(Date.now() + 120_000);
    const result = await cached("k", WINDOW, async () => {
      throw new Error("supabase_500");
    });
    expect(result).toEqual(first);
  });

  it("rejects when the database fails and the shared copy is too old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fakeRedis();
    await cached("k", WINDOW, async () => ({ a: 1 }));
    vi.setSystemTime(Date.now() + 700_000);
    await expect(
      cached("k", WINDOW, async () => {
        throw new Error("supabase_500");
      })
    ).rejects.toThrow("supabase_500");
  });

  it("still answers from the database when Redis is down", async () => {
    fakeRedis({ down: true });
    const result = await cached("k", WINDOW, async () => ({ a: 2 }));
    expect(result.data).toEqual({ a: 2 });
  });

  it("does not call Redis when it is not configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    const redis = fakeRedis();
    const result = await cached("k", WINDOW, async () => ({ a: 3 }));
    expect(result.data).toEqual({ a: 3 });
    expect(redis.calls).toEqual([]);
  });
});
