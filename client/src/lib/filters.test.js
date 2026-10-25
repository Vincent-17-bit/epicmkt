import { describe, expect, it } from "vitest";
import { applyFilters, buildChips, readFilters, toApiFilters } from "./filters.js";

const read = (qs) => readFilters(new URLSearchParams(qs));

describe("business filters", () => {
  it("reads open and closed from the same param and keeps old links working", () => {
    expect(read("open=1").status).toBe("open");
    expect(read("open=0").status).toBe("closed");
    expect(read("open=constructor").status).toBe("");
    expect(read("").status).toBe("");
  });

  it("round-trips every toggle through the URL", () => {
    const patch = { status: "closed", open24: true, openLate: true, openSunday: true, flash: true, offers: true, verified: true, featured: true, whatsapp: true, isNew: true };
    const params = applyFilters(new URLSearchParams(), patch);
    expect(params.toString()).toBe("open=0&h24=1&late=1&sun=1&flash=1&offers=1&verified=1&featured=1&wa=1&new=1");
    expect(read(params.toString())).toMatchObject(patch);
    const cleared = applyFilters(params, { status: "", open24: false, isNew: false });
    expect(cleared.has("open")).toBe(false);
    expect(cleared.has("h24")).toBe(false);
    expect(cleared.has("new")).toBe(false);
  });

  it("maps to api flags and chips", () => {
    const filters = read("open=0&h24=1&wa=1");
    expect(toApiFilters(filters, null, 1)).toMatchObject({ openNow: false, closedNow: true, open24: true, hasWhatsapp: true, verifiedOnly: false });
    expect(buildChips(filters, null).map((c) => c.label)).toEqual(["Closed now", "Open 24 hours", "On WhatsApp"]);
  });
});
