import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../applications/supabaseClient", () => ({ supabase: { rpc } }));
const { logSearch } = await import("./liveLegacy.js");

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("logSearch", () => {
  it("sends the word once when it works", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(logSearch("bread")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("log_search", { p_term: "bread" });
  });

  it("tries again after a network failure and keeps the search", async () => {
    rpc.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ data: null, error: null });
    const done = logSearch("bread");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("tries again after an error answer from the server", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } }).mockResolvedValueOnce({ data: null, error: null });
    const done = logSearch("bread");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toEqual({ ok: true });
  });

  it("gives up quietly after two failures and never throws", async () => {
    rpc.mockRejectedValue(new Error("network"));
    const done = logSearch("bread");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toEqual({ ok: false });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
