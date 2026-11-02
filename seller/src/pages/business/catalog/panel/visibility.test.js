import { describe, expect, it } from "vitest";
import { reasonFor } from "./visibility.js";

const item = (extra = {}) => ({ visibility: "showing", soldOut: false, removed: false, adminHideReason: null, ...extra });
const live = { live: true, status: "live" };

describe("why an item is or is not showing", () => {
  it("says it is showing when nothing is in the way", () => {
    expect(reasonFor(item(), live)).toMatchObject({ showing: true, code: "showing", fix: null });
  });

  it("explains a draft and offers Show", () => {
    expect(reasonFor(item({ visibility: "draft" }), live)).toMatchObject({ showing: false, code: "draft", fix: { kind: "show", label: "Show" } });
  });

  it("explains an item the seller hid and offers Show", () => {
    expect(reasonFor(item({ visibility: "hidden_me" }), live)).toMatchObject({ code: "hidden", fix: { kind: "show" } });
  });

  it("explains out of stock and offers Back in stock", () => {
    expect(reasonFor(item({ soldOut: true }), live)).toMatchObject({ code: "out_of_stock", fix: { kind: "restock", label: "Back in stock" } });
  });

  it("offers no fix for an item staff hid, and passes their reason on", () => {
    const r = reasonFor(item({ visibility: "hidden_admin", adminHideReason: "Wrong photo" }), live);
    expect(r).toMatchObject({ code: "hidden_admin", fix: null });
    expect(r.text).toContain("Wrong photo");
  });

  it("explains an item staff removed", () => {
    expect(reasonFor(item({ removed: true, visibility: "hidden_admin" }), live)).toMatchObject({ code: "removed", fix: null });
  });

  it("says the shop is paused and points to the subscription", () => {
    expect(reasonFor(item(), { live: false, status: "paused" })).toMatchObject({ code: "paused", fix: { kind: "link", to: "/business/subscription" } });
  });

  it("says the plan has expired and offers Go to subscription", () => {
    const r = reasonFor(item(), { live: false, status: "expired" });
    expect(r).toMatchObject({ code: "expired", fix: { kind: "link", label: "Go to subscription", to: "/business/subscription" } });
  });

  it("treats a shop that is marked live but not live as expired", () => {
    expect(reasonFor(item(), { live: false, status: "live" }).code).toBe("expired");
  });

  it("says pending and suspended with no fix", () => {
    expect(reasonFor(item(), { live: false, status: "pending" })).toMatchObject({ code: "pending", fix: null });
    expect(reasonFor(item(), { live: false, status: "suspended" })).toMatchObject({ code: "suspended", fix: null });
    expect(reasonFor(item(), live, { suspended: true })).toMatchObject({ code: "suspended" });
  });

  it("puts what staff did before what the shop did, and the shop before the item", () => {
    expect(reasonFor(item({ visibility: "hidden_admin" }), { live: false, status: "paused" }).code).toBe("hidden_admin");
    expect(reasonFor(item({ visibility: "draft" }), { live: false, status: "paused" }).code).toBe("paused");
    expect(reasonFor(item({ visibility: "draft", soldOut: true }), live).code).toBe("draft");
  });
});
