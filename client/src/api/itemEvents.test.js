import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
let live = true;

vi.mock("./applications/supabaseClient", () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
vi.mock("./flash/mode.js", () => ({ isLive: () => live }));
vi.mock("@epicmkt/backend", () => ({
  logEvent: vi.fn(() => Promise.resolve({ ok: true })),
  logContactEvent: vi.fn(() => Promise.resolve({ ok: true })),
  scrubPayload: (p) => p,
  looksLikeCoordinates: () => false,
}));
vi.mock("./flash/index.js", () => ({ flash: {} }));
vi.mock("./browse/index.js", () => ({}));
vi.mock("./offers/index.js", () => ({}));
vi.mock("./products/index.js", () => ({}));

const ID = "11111111-1111-4111-8111-111111111111";

describe("item events", () => {
  beforeEach(() => {
    rpc.mockClear();
    live = true;
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("logs an item view with its flash and offer flags", async () => {
    const { logEvent } = await import("./index.js");
    await logEvent("item_view", { businessId: "b", itemId: ID, flash: true, offer: false });
    await flush();
    expect(rpc).toHaveBeenCalledWith("log_item_event", { p_item: ID, p_kind: "view", p_flash: true, p_offer: false });
  });

  it("logs taps as whatsapp or call", async () => {
    const { logContactEvent } = await import("./index.js");
    await logContactEvent({ businessId: "b", itemId: ID, type: "whatsapp", flash: false, offer: true });
    await logContactEvent({ businessId: "b", itemId: ID, type: "call" });
    await flush();
    expect(rpc).toHaveBeenNthCalledWith(1, "log_item_event", { p_item: ID, p_kind: "whatsapp", p_flash: false, p_offer: true });
    expect(rpc).toHaveBeenNthCalledWith(2, "log_item_event", { p_item: ID, p_kind: "call", p_flash: false, p_offer: false });
  });

  it("ignores other events, demo ids and the demo backend", async () => {
    const { logEvent, logContactEvent } = await import("./index.js");
    await logEvent("share_click", { itemId: ID });
    await logEvent("item_view", { itemId: "demo-1" });
    live = false;
    await logContactEvent({ businessId: "b", itemId: ID, type: "call" });
    await flush();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws when the call fails", async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error("down")));
    const { logEvent } = await import("./index.js");
    await expect(logEvent("item_view", { itemId: ID })).resolves.toBeDefined();
  });
});
