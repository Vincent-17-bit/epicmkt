import { describe, expect, it } from "vitest";
import { getTrail, pageTitle } from "./getTrail.js";

const categories = { status: "success", data: [{ id: "barbershops", name: "Barbershops", group: "Beauty and grooming" }, { id: "gyms", name: "Gyms", group: "Health and wellness" }] };
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
  it("ignores every query param on a business page", () => {
    const search = "?section=cuts&offer=p_001&utm_source=x&src=qr";
    const plain = getTrail({ ...base, business, pathname: "/b/fade-kings" });
    expect(getTrail({ ...base, business, pathname: "/b/fade-kings", search })).toEqual(plain);
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

  it("builds the item page trail: home, group, category, business, item", () => {
    const r = getTrail({ ...base, business, pathname: "/b/fade-kings/item/skin-fade" });
    expect(labels(r)).toEqual(["Home", "Beauty and grooming", "Barbershops", "Fade Kings Barbershop", "Skin fade"]);
    expect(targets(r)).toEqual(["/", undefined, "/c/barbershops", "/b/fade-kings", undefined]);
    expect(r.invalidItem).toBe(false);
  });

  it("leaves the group out when the category has none", () => {
    const plain = { status: "success", data: [{ id: "barbershops", name: "Barbershops" }] };
    const r = getTrail({ ...base, categories: plain, business, pathname: "/b/fade-kings/item/skin-fade" });
    expect(labels(r)).toEqual(["Home", "Barbershops", "Fade Kings Barbershop", "Skin fade"]);
  });

  it("shows Item unavailable as the last crumb for an unknown item and flags it", () => {
    const r = getTrail({ ...base, business, pathname: "/b/fade-kings/item/nope" });
    expect(labels(r).at(-1)).toBe("Item unavailable");
    expect(r.trail.at(-1).to).toBeUndefined();
    expect(r.trail.at(-2).to).toBe("/b/fade-kings");
    expect(r.invalidItem).toBe(true);
  });

  it("is loading or not found on the item page like the business page", () => {
    expect(getTrail({ ...base, pathname: "/b/fade-kings/item/skin-fade" }).status).toBe("loading");
    expect(getTrail({ ...base, business: { status: "error", data: undefined }, pathname: "/b/fade-kings/item/skin-fade" }).status).toBe("not-found");
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
    ["/offers", ["Home", "Offers"]],
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

  it.each([
    ["/FLASH", "?x=1", ["Home", "Flash sales"]],
    ["/Flash/", "", ["Home", "Flash sales"]],
    ["/flash", "?category=barbershop&sort=ending&page=2", ["Home", "Flash sales"]],
    ["/Offers", "?section=cuts", ["Home", "Offers"]],
    ["/OFFERS/", "", ["Home", "Offers"]]
  ])("matches %s%s case-insensitively with the same static trail", (pathname, search, expected) => {
    const r = getTrail({ ...base, pathname, search });
    expect(r.status).toBe("ready");
    expect(labels(r)).toEqual(expected);
    expect(targets(r)).toEqual(["/", undefined]);
    expect(r.trail.slice(1).every((c) => !c.icon)).toBe(true);
  });

  it.each(["/flash/anything", "/flashes", "/offers/1", "/offerss"])("does not match %s", (pathname) => {
    expect(getTrail({ ...base, pathname }).status).toBe("none");
  });

  it("keeps existing routes case-sensitive in the trail map", () => {
    expect(getTrail({ ...base, pathname: "/ABOUT" }).status).toBe("none");
  });

  it("never adds Flash sales or Offers to a business or item trail", () => {
    const r = getTrail({ ...base, business, pathname: "/b/fade-kings/item/skin-fade", search: "?from=flash" });
    expect(labels(r)).toEqual(["Home", "Beauty and grooming", "Barbershops", "Fade Kings Barbershop", "Skin fade"]);
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
