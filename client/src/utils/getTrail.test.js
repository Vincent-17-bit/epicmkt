import { describe, expect, it } from "vitest";
import { getTrail, pageTitle } from "./getTrail.js";

const categories = { status: "success", data: [{ id: "barbershops", name: "Barbershops" }, { id: "gyms", name: "Gyms" }] };
const towns = { status: "success", data: [{ slug: "maseno", name: "Maseno" }, { slug: "kisumu-cbd", name: "Kisumu CBD" }] };
const biz = {
  id: "b_001",
  slug: "fade-kings",
  name: "Fade Kings Barbershop",
  categoryId: "barbershops",
  area: "Maseno",
  townSlug: "maseno",
  services: [{ id: "skin-fade", name: "Skin fade" }]
};
const business = { status: "success", data: biz };
const idle = { status: "pending", data: undefined };
const base = { categories, towns, business: idle };

const labels = (r) => r.trail.map((c) => c.label);
const targets = (r) => r.trail.map((c) => c.to);

describe("getTrail", () => {
  it("ignores every query param except item on a business page", () => {
    const search = "?section=cuts&offer=p_001&utm_source=x&src=qr";
    const plain = getTrail({ ...base, business, pathname: "/b/fade-kings" });
    expect(getTrail({ ...base, business, pathname: "/b/fade-kings", search })).toEqual(plain);
    const withItem = getTrail({ ...base, business, pathname: "/b/fade-kings", search: `${search}&item=skin-fade` });
    expect(labels(withItem)).toEqual(["Home", "Barbershops", "Maseno", "Fade Kings Barbershop", "Skin fade"]);
  });

  it("has no trail on Home", () => {
    expect(getTrail({ ...base, pathname: "/" }).status).toBe("none");
  });

  it("builds a category trail", () => {
    const r = getTrail({ ...base, pathname: "/c/barbershops" });
    expect(labels(r)).toEqual(["Home", "Barbershops"]);
    expect(targets(r)).toEqual(["/", undefined]);
  });

  it("adds the town when the category is filtered by town", () => {
    const r = getTrail({ ...base, pathname: "/c/barbershops", search: "?town=maseno" });
    expect(labels(r)).toEqual(["Home", "Barbershops", "Maseno"]);
    expect(targets(r)).toEqual(["/", "/c/barbershops", undefined]);
  });

  it("ignores an unknown town", () => {
    const r = getTrail({ ...base, pathname: "/c/barbershops", search: "?town=nowhere" });
    expect(labels(r)).toEqual(["Home", "Barbershops"]);
  });

  it("reports an unknown category as not found", () => {
    expect(getTrail({ ...base, pathname: "/c/unknown" }).status).toBe("not-found");
  });

  it("shows search with the query", () => {
    const r = getTrail({ ...base, pathname: "/search", search: "?q=haircut" });
    expect(labels(r)).toEqual(["Home", 'Search: "haircut"']);
  });

  it("truncates long search queries to 24 characters", () => {
    const q = "a very long search query that goes on and on";
    const label = labels(getTrail({ ...base, pathname: "/search", search: `?q=${encodeURIComponent(q)}` }))[1];
    const inner = label.slice('Search: "'.length, -1);
    expect(inner.length).toBeLessThanOrEqual(24);
    expect(inner.endsWith("…")).toBe(true);
  });

  it("shows plain Search without a query", () => {
    expect(labels(getTrail({ ...base, pathname: "/search" }))).toEqual(["Home", "Search"]);
  });

  it("builds a business trail from fetched data", () => {
    const r = getTrail({ ...base, business, pathname: "/b/fade-kings" });
    expect(labels(r)).toEqual(["Home", "Barbershops", "Maseno", "Fade Kings Barbershop"]);
    expect(targets(r)).toEqual(["/", "/c/barbershops", "/c/barbershops?town=maseno", undefined]);
  });

  it("omits the town when the business has none", () => {
    const noTown = { status: "success", data: { ...biz, area: "", townSlug: undefined } };
    const r = getTrail({ ...base, business: noTown, pathname: "/b/fade-kings" });
    expect(labels(r)).toEqual(["Home", "Barbershops", "Fade Kings Barbershop"]);
  });

  it("adds the item as the last crumb and links the business", () => {
    const r = getTrail({ ...base, business, pathname: "/b/fade-kings", search: "?item=skin-fade" });
    expect(labels(r)).toEqual(["Home", "Barbershops", "Maseno", "Fade Kings Barbershop", "Skin fade"]);
    expect(r.trail[3].to).toBe("/b/fade-kings");
    expect(r.invalidItem).toBe(false);
  });

  it("drops an invalid item and flags it", () => {
    const r = getTrail({ ...base, business, pathname: "/b/fade-kings", search: "?item=nope" });
    expect(labels(r)).toEqual(["Home", "Barbershops", "Maseno", "Fade Kings Barbershop"]);
    expect(r.invalidItem).toBe(true);
  });

  it("is loading while the business or categories are pending", () => {
    expect(getTrail({ ...base, pathname: "/b/fade-kings" }).status).toBe("loading");
    expect(getTrail({ categories: idle, towns, business, pathname: "/b/fade-kings" }).status).toBe("loading");
    expect(getTrail({ categories: idle, towns, business: idle, pathname: "/c/gyms" }).status).toBe("loading");
  });

  it("is not found when the business fails to load", () => {
    const r = getTrail({ ...base, business: { status: "error", data: undefined }, pathname: "/b/hidden" });
    expect(r.status).toBe("not-found");
    expect(r.trail).toEqual([]);
  });

  it.each([
    ["/flash", ["Home", "Flash sales"]],
    ["/sell", ["Home", "Become a seller"]],
    ["/sell/register", ["Home", "Become a seller", "Register"]],
    ["/about", ["Home", "About"]],
    ["/contact", ["Home", "Contact"]],
    ["/faq", ["Home", "FAQs"]],
    ["/privacy", ["Home", "Privacy Policy"]],
    ["/terms", ["Home", "Terms of Service"]],
    ["/cookies", ["Home", "Cookie notice"]]
  ])("builds a static trail for %s", (pathname, expected) => {
    expect(labels(getTrail({ ...base, pathname }))).toEqual(expected);
  });

  it("links the seller crumb on the register page", () => {
    expect(targets(getTrail({ ...base, pathname: "/sell/register" }))).toEqual(["/", "/sell", undefined]);
  });

  it("has no trail on unknown pages (404)", () => {
    expect(getTrail({ ...base, pathname: "/nope/nope" }).status).toBe("none");
  });

  it("keeps very long names intact for the UI to truncate", () => {
    const name = "The Extraordinarily Long Named Barbershop and Grooming Lounge of Maseno Town";
    const long = { status: "success", data: { ...biz, name } };
    const r = getTrail({ ...base, business: long, pathname: "/b/fade-kings" });
    expect(labels(r).at(-1)).toBe(name);
  });

  it("builds the page title from the trail", () => {
    const r = getTrail({ ...base, business, pathname: "/b/fade-kings" });
    expect(pageTitle(r.trail)).toBe("Fade Kings Barbershop | Maseno | Barbershops");
  });
});
