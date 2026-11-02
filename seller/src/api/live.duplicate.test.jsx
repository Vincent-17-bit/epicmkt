import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock("./client.js", () => ({ supabase: { rpc: (...a) => rpc(...a), functions: { invoke: (...a) => invoke(...a) } } }));

const live = await import("./live.js");

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

describe("live duplicateItem", () => {
  it("makes the draft, then asks the server to copy the media into it, and returns the new id", async () => {
    rpc.mockResolvedValue({ data: "new-item", error: null });
    invoke.mockResolvedValue({ data: { copied: 3, failed: [], total: 3 }, error: null });
    await expect(live.duplicateItem("old-item")).resolves.toBe("new-item");
    expect(rpc).toHaveBeenCalledWith("seller_duplicate_item", { p_id: "old-item" });
    expect(invoke).toHaveBeenCalledWith("seller-item-copy-media", { body: { fromItemId: "old-item", toItemId: "new-item" } });
  });

  it("keeps the draft when the media copy fails", async () => {
    rpc.mockResolvedValue({ data: "new-item", error: null });
    invoke.mockResolvedValue({ data: null, error: { context: { status: 503, json: async () => ({ error: "media_not_configured" }) } } });
    await expect(live.duplicateItem("old-item")).resolves.toBe("new-item");
  });

  it("does not try to copy media when the draft could not be made, and passes the database error on", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "limit_reached:items" } });
    await expect(live.duplicateItem("old-item")).rejects.toMatchObject({ code: "limit_reached" });
    expect(invoke).not.toHaveBeenCalled();
  });
});
