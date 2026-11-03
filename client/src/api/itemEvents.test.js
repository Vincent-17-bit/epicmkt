import { beforeEach, describe, expect, it, vi } from "vitest";

const flash = vi.hoisted(() => ({ logItemEvent: vi.fn() }));
const demo = vi.hoisted(() => ({ logEvent: vi.fn(), logContactEvent: vi.fn() }));

vi.mock("./flash/index.js", async (original) => ({ ...(await original()), logItemEvent: flash.logItemEvent }));
vi.mock("@epicmkt/backend", async (original) => ({ ...(await original()), logEvent: demo.logEvent, logContactEvent: demo.logContactEvent }));

import { logContactEvent, logEvent } from "./index.js";

beforeEach(() => {
  flash.logItemEvent.mockReset().mockResolvedValue({ ok: true });
  demo.logEvent.mockReset();
  demo.logContactEvent.mockReset();
});

describe("item events", () => {
  it("records an item view for the seller's stats and keeps the demo log", () => {
    logEvent("item_view", { itemId: "i1", businessId: "b1" });
    expect(flash.logItemEvent).toHaveBeenCalledWith("i1", "view");
    expect(demo.logEvent).toHaveBeenCalledWith("item_view", { itemId: "i1", businessId: "b1" });
  });

  it("records WhatsApp and call taps", () => {
    logContactEvent({ itemId: "i1", businessId: "b1", type: "whatsapp" });
    logContactEvent({ itemId: "i1", businessId: "b1", type: "call" });
    expect(flash.logItemEvent.mock.calls).toEqual([["i1", "whatsapp"], ["i1", "call"]]);
    expect(demo.logContactEvent).toHaveBeenCalledTimes(2);
  });

  it("ignores every other event", () => {
    logEvent("visit_store_click", { itemId: "i1" });
    logContactEvent({ itemId: "i1", type: "directions" });
    expect(flash.logItemEvent).not.toHaveBeenCalled();
  });

  it("never shows an error to the visitor", () => {
    flash.logItemEvent.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => logEvent("item_view", { itemId: "i1" })).not.toThrow();
    flash.logItemEvent.mockRejectedValue(new Error("boom"));
    expect(() => logContactEvent({ itemId: "i1", type: "call" })).not.toThrow();
  });
});
