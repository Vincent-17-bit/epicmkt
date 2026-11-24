import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("./applications/supabaseClient", () => ({ supabase: { rpc } }));

import { submitReport } from "./reports.js";

const ID = "8af49ac4-76c8-4948-b5fe-0774e095b8c4";

describe("submitReport", () => {
  beforeEach(() => rpc.mockReset());

  it("sends the report to the database", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await submitReport({ businessId: ID, reason: "scam", message: "x", contact: "07" })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("submit_report", { p_business: ID, p_reason: "scam", p_message: "x", p_contact: "07" });
  });

  it("turns field problems into form errors", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "invalid", fields: { reason: "Choose a reason" } }, error: null });
    await expect(submitReport({ businessId: ID })).rejects.toMatchObject({ name: "ValidationError", fields: { reason: "Choose a reason" } });
  });

  it("refuses a shop id that is not a live one without calling the database", async () => {
    await expect(submitReport({ businessId: "b_001", reason: "scam" })).rejects.toMatchObject({ name: "NotFoundError" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is an error when the database fails or limits the sender", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(submitReport({ businessId: ID, reason: "scam" })).rejects.toMatchObject({ name: "ReportError" });
    rpc.mockResolvedValue({ data: { ok: false, error: "rate_limited" }, error: null });
    await expect(submitReport({ businessId: ID, reason: "scam" })).rejects.toThrow("rate_limited");
  });
});
