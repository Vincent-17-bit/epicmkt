import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("./client.js", () => ({ supabase: { rpc: (...a) => rpc(...a), from: (...a) => from(...a) } }));

const live = await import("./live.js");
const mock = await import("./mock.js");

// A query chain that answers every select/eq/order/maybeSingle with the same rows.
const table = (data) => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: () => Promise.resolve({ data, error: null }), then: (ok, no) => Promise.resolve({ data: [].concat(data ?? []), error: null }).then(ok, no) };
  return q;
};
const HOURS = { mon: ["08:00", "18:00"], sun: ["20:00", "02:00"] };

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("live setHours", () => {
  it("calls seller_set_hours with the week and returns what the database stored", async () => {
    rpc.mockResolvedValue({ data: HOURS, error: null });
    await expect(live.setHours({ ...HOURS, tue: null })).resolves.toEqual(HOURS);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("seller_set_hours", { p_hours: { ...HOURS, tue: null } });
  });

  it("turns every database refusal into an error with that code, like the mock", async () => {
    mock.resetMock();
    await mock.login("es100001", "Demo-Passw0rd");
    const cases = [
      [{ mon: ["25:00", "18:00"] }, "invalid_time"],
      [{ mon: ["09:00", "09:00"] }, "zero_length"],
      [{ mon: ["08:00"] }, "invalid_interval"],
      [{ monday: ["08:00", "18:00"] }, "unknown_day"],
      [[], "invalid_hours"],
    ];
    for (const [hours, code] of cases) {
      rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      await expect(live.setHours(hours)).rejects.toMatchObject({ code });
      await expect(mock.setHours(hours)).rejects.toMatchObject({ code });
    }
  });

  it("keeps the suspension and not-a-seller codes", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "account_suspended" } });
    await expect(live.setHours({})).rejects.toMatchObject({ code: "account_suspended" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "not_a_seller" } });
    await expect(live.setHours({})).rejects.toMatchObject({ code: "not_a_seller" });
  });
});

describe("live reads return hours", () => {
  const row = { id: "b1", seller_id: "ES1", name: "Shop", slug: "shop", status: "live", plan_key: "standard", category_id: "barber", verification_level: "verified", hours: HOURS, exceptions: [], timezone: "Africa/Nairobi" };

  it("getSubscription carries the hours, or an empty object when none are set", async () => {
    const run = async (hours) => {
      from.mockImplementation((name) => table(name === "businesses" ? { ...row, hours } : name === "categories" ? { id: "barber", name: "Barber" } : name === "global_limits" ? { standard: {}, premium: {} } : []));
      rpc.mockResolvedValue({ data: 1, error: null });
      return (await live.getSubscription()).business.hours;
    };
    expect(await run(HOURS)).toEqual(HOURS);
    expect(await run({})).toEqual({});
    expect(await run(null)).toEqual({});
  });

  it("getShopPreview carries the hours", async () => {
    from.mockImplementation((name) => table(name === "businesses" ? row : name === "categories" ? { name: "Barber" } : []));
    rpc.mockImplementation((name) => Promise.resolve({ data: name === "get_server_time" ? "2026-10-12T09:00:00Z" : name === "seller_catalog_items" ? { shop: { slug: "shop", status: "live", live: true, plan_key: "standard" }, items: [] } : [], error: null }));
    expect((await live.getShopPreview()).shop.hours).toEqual(HOURS);
  });
});
