import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn(async () => ({ data: null, error: null }));
vi.mock("./applications/supabaseClient", () => ({ supabase: { rpc: (...a) => rpc(...a) } }));
const { logBusinessEvent } = await import("./events.js");

const BIZ = "10000000-0000-0000-0000-0000000000a1";
const ITEM = "20000000-0000-0000-0000-0000000000a1";

describe("logBusinessEvent", () => {
  beforeEach(() => rpc.mockClear());

  it("sends one rpc with the business, the type and the item", async () => {
    expect(await logBusinessEvent({ businessId: BIZ, type: "whatsapp", itemId: ITEM })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("log_business_event", { p_business_id: BIZ, p_type: "whatsapp", p_item_id: ITEM });
  });

  it("sends no item when the id is missing or not a uuid", async () => {
    await logBusinessEvent({ businessId: BIZ, type: "view", itemId: "not-a-uuid" });
    expect(rpc).toHaveBeenCalledWith("log_business_event", { p_business_id: BIZ, p_type: "view", p_item_id: null });
  });

  it("ignores unknown types and ids that are not uuids without calling the server", async () => {
    expect(await logBusinessEvent({ businessId: BIZ, type: "click" })).toEqual({ ok: false });
    expect(await logBusinessEvent({ businessId: "b_001", type: "call" })).toEqual({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws when the server call fails", async () => {
    rpc.mockRejectedValueOnce(new Error("offline"));
    expect(await logBusinessEvent({ businessId: BIZ, type: "call" })).toEqual({ ok: false });
  });
});
