import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const chain = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() };
const from = vi.fn();
vi.mock("./client.js", () => ({ supabase: { rpc: (...a) => rpc(...a), from: (...a) => from(...a) } }));

const live = await import("./live.js");

const saleRow = { id: "fs-1", item_id: "it-1", items: { name: "Fade cut", price: 500 }, headline: "Last hours", starts_at: "2026-10-17T09:00:00Z", ends_at: "2026-10-17T15:00:00Z", discount_type: "percent", discount_value: 20, quantity_note: null, after_end: "keep", status: "live" };

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  for (const fn of Object.values(chain)) fn.mockReset();
  from.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: saleRow, error: null });
});

describe("live extendFlashSale", () => {
  it("calls the extend_flash_sale function with the sale and the new end time", async () => {
    rpc.mockResolvedValue({ data: { id: "fs-1" }, error: null });
    await expect(live.extendFlashSale("fs-1", "2026-10-17T16:00:00.000Z")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("extend_flash_sale", { p_id: "fs-1", p_ends_at: "2026-10-17T16:00:00.000Z" });
  });

  it.each(["invalid_window", "duration_too_long", "flash_closed", "not_found"])("turns the database error %s into a seller error with that code", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } });
    await expect(live.extendFlashSale("fs-1", "2026-10-17T16:00:00.000Z")).rejects.toMatchObject({ code });
  });
});

describe("live updateFlashSale", () => {
  it("refuses a headline or note the database would reject, without sending anything", async () => {
    await expect(live.updateFlashSale("fs-1", { headline: "ab", quantityNote: "" })).rejects.toMatchObject({ code: "invalid_headline" });
    await expect(live.updateFlashSale("fs-1", { headline: "Fine headline", quantityNote: "x" })).rejects.toMatchObject({ code: "invalid_note" });
    await expect(live.updateFlashSale("fs-1", { headline: "h".repeat(81), quantityNote: "" })).rejects.toMatchObject({ code: "invalid_headline" });
    expect(from).not.toHaveBeenCalled();
  });

  it("sends valid text, and blank text clears the field", async () => {
    const out = await live.updateFlashSale("fs-1", { headline: "Last hours", quantityNote: "" });
    expect(chain.update).toHaveBeenCalledWith({ headline: "Last hours", quantity_note: null });
    expect(out).toMatchObject({ id: "fs-1", headline: "Last hours" });
    await live.updateFlashSale("fs-1", { headline: "", quantityNote: "" });
    expect(chain.update).toHaveBeenLastCalledWith({ headline: null, quantity_note: null });
  });
});
