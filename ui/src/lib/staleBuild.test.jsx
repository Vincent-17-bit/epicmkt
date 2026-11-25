import { describe, expect, it, vi } from "vitest";
import { recoverFromStaleBuild } from "./staleBuild.js";

function fake() {
  const handlers = {};
  const store = new Map();
  return {
    handlers,
    target: { addEventListener: (n, f) => { handlers[n] = f; }, location: { reload: vi.fn() } },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  };
}

describe("recoverFromStaleBuild", () => {
  it("reloads once when a build file has gone, and not again within 10 seconds", () => {
    const { target, handlers, storage } = fake();
    recoverFromStaleBuild(target, storage);
    const event = { preventDefault: vi.fn() };
    handlers["vite:preloadError"](event);
    handlers["vite:preloadError"](event);
    expect(target.location.reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
  it("still reloads when storage is blocked", () => {
    const { target, handlers } = fake();
    recoverFromStaleBuild(target, { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } });
    handlers["vite:preloadError"]({});
    expect(target.location.reload).toHaveBeenCalledTimes(1);
  });
});
