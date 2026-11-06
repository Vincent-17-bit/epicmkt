// A18: the live wrappers call the migration 0090 functions with the argument names the database expects.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("./client.js", () => ({ supabase: { rpc: (...a) => rpc(...a), from: vi.fn() } }));
const live = await import("./live.js");

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("open values (live)", () => {
  it("findOptionValues -> seller_option_values", async () => {
    await live.findOptionValues("material", "Mahog");
    expect(rpc).toHaveBeenCalledWith("seller_option_values", { p_kind: "material", p_query: "Mahog", p_limit: 8 });
    await live.findOptionValues("brand");
    expect(rpc).toHaveBeenLastCalledWith("seller_option_values", { p_kind: "brand", p_query: "", p_limit: 8 });
  });

  it("addOptionValue -> seller_add_option_value, shade only when given", async () => {
    await live.addOptionValue("color", "Wine red", "#7b1e3a");
    expect(rpc).toHaveBeenCalledWith("seller_add_option_value", { p_kind: "color", p_label: "Wine red", p_hex: "#7b1e3a" });
    await live.addOptionValue("brand", "Nike");
    expect(rpc).toHaveBeenLastCalledWith("seller_add_option_value", { p_kind: "brand", p_label: "Nike", p_hex: null });
  });

  it("linkItemValues -> seller_link_item_values", async () => {
    await live.linkItemValues("it-1", [{ slot: "brand", valueId: "v-1" }]);
    expect(rpc).toHaveBeenCalledWith("seller_link_item_values", { p_item: "it-1", p_uses: [{ slot: "brand", valueId: "v-1" }] });
  });

  it("a database refusal becomes an ApiError with the code", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "too_many_pending" } });
    await expect(live.addOptionValue("brand", "X")).rejects.toMatchObject({ code: "too_many_pending" });
  });
});
