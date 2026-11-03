import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as backend from "@epicmkt/backend";
import * as api from "../../../api/index.js";
import { M, signedInApp } from "../../../test/utils.jsx";
import { itemDetailOf } from "../../../lib/itemDetail.js";

const open = (id, prepare) => signedInApp(`/business/catalog/${id}`, prepare);
const preview = async () => screen.findByTestId("item-preview");

beforeEach(() => vi.unstubAllEnvs());

describe("seller item page", () => {
  it("shows the real customer item view in preview mode with the item's own data", async () => {
    await open("it-fade");
    const page = await preview();
    expect(within(page).getByRole("heading", { level: 1, name: "Fade cut" })).toBeInTheDocument();
    expect(within(page).getByText("KES 500")).toBeInTheDocument();
    expect(within(page).getByText("Sold by")).toBeInTheDocument();
  });

  it("keeps the preview inert: no live links, disabled buttons", async () => {
    await open("it-fade");
    const page = await preview();
    for (const label of within(page).getAllByText("Chat Seller")) {
      const link = label.closest("a");
      expect(link).not.toHaveAttribute("href");
      expect(link).toHaveAttribute("aria-disabled", "true");
    }
    expect(within(page).getByRole("button", { name: /Share/ })).toBeDisabled();
    expect(within(page).getByRole("button", { name: /Report wrong price/ })).toBeDisabled();
    for (const label of within(page).getAllByText("Visit Store")) expect(label.closest("a")).not.toHaveAttribute("href");
  });

  it("says a showing item is showing and builds the live link from the client url", async () => {
    vi.stubEnv("VITE_CLIENT_URL", "https://client.test");
    await open("it-fade");
    expect(await screen.findByRole("heading", { name: "Showing to customers" })).toBeInTheDocument();
    const live = screen.getByRole("link", { name: "Open live page" });
    expect(live.getAttribute("href")).toMatch(/^https:\/\/client\.test\/b\/[a-z0-9-]+\/i\/it-fade$/);
    expect(live).toHaveAttribute("target", "_blank");
  });

  it("copies the link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await open("it-fade");
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/i/it-fade"));
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
  });

  it("explains a hidden item and shows it with one click", async () => {
    const user = userEvent.setup();
    await open("it-old");
    expect(await screen.findByRole("heading", { name: "Not showing to customers" })).toBeInTheDocument();
    expect(screen.getByText("You hid this item.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show to customers" }));
    expect(await screen.findByText("Item is now showing.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Showing to customers" })).toBeInTheDocument();
  });

  it("explains an out of stock item and offers the restock dialog for a counted item", async () => {
    const user = userEvent.setup();
    await open("it-gel");
    expect(await screen.findByText(/Marked out of stock/)).toBeInTheDocument();
    const reason = screen.getByText(/Marked out of stock/).closest("li");
    await user.click(within(reason).getByRole("button", { name: "Back in stock" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("explains a paused shop and resumes it from the page", async () => {
    const user = userEvent.setup();
    await open("it-fade", async () => api.pauseListing(true));
    const reason = (await screen.findByText(/Your shop is paused/)).closest("li");
    await user.click(within(reason).getByRole("button", { name: "Resume shop" }));
    expect(await screen.findByText("Your shop is live again.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Your shop is paused/)).not.toBeInTheDocument());
  });

  it("hides and shows from the actions", async () => {
    const user = userEvent.setup();
    await open("it-fade");
    await user.click(await screen.findByRole("button", { name: "Hide" }));
    expect(await screen.findByRole("heading", { name: "Not showing to customers" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Show" })).toBeEnabled());
  });

  it("deletes after a short wait and lets the seller undo first", async () => {
    const user = userEvent.setup();
    await open("it-fade");
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByTestId("undo-bar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByTestId("undo-bar")).not.toBeInTheDocument();
    const { items } = await api.getCatalog();
    expect(items.some((i) => i.id === "it-fade")).toBe(true);
  });

  it("shows views and taps, and switches the period", async () => {
    const user = userEvent.setup();
    await open("it-fade");
    const panel = (await screen.findByRole("heading", { name: "Customer activity" })).closest("section");
    expect(await within(panel).findByText("Views")).toBeInTheDocument();
    expect(within(panel).getByText("WhatsApp taps")).toBeInTheDocument();
    expect(within(panel).getByText("Call taps")).toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: "Views per day over the last 30 days" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "7 days" }));
    expect(await within(panel).findByRole("img", { name: "Views per day over the last 7 days" })).toBeInTheDocument();
  });

  it("says so when the item is not in the listings", async () => {
    await open("nope");
    expect(await screen.findByText("This item is not in your listings")).toBeInTheDocument();
  });

  it("links to Flash and Offers and edits through the editor", async () => {
    await open("it-fade");
    expect(await screen.findByRole("link", { name: "Flash sales" })).toHaveAttribute("href", "/business/flash");
    expect(screen.getByRole("link", { name: "Offers" })).toHaveAttribute("href", "/business/offers");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/business/catalog/it-fade/edit");
  });
});

describe("item page data matches the customer data shape", () => {
  const shop = { slug: "demo-shop", name: "Demo", categoryName: "Barbershop", town: "Maseno", hours: {}, exceptions: [], timezone: "Africa/Nairobi", verified: true, phone: "0712345678", whatsapp: "0712345678" };
  const item = { id: "it-1", name: "Fade", description: "Clean fade", price: 500, priceType: "fixed", availability: "available", imagePaths: ["a.webp"], trackStock: false, highlights: [], specs: [], includes: [] };

  it("has the same fields as the item the customer page receives", async () => {
    const demo = await backend.getItemDetail((await backend.getAllProducts()).items?.[0]?.id ?? (await backend.getAllProducts())[0].id, {});
    const mine = itemDetailOf({ item, shop });
    expect(Object.keys(mine).sort()).toEqual(Object.keys(demo).sort());
    for (const key of ["name", "slug", "logo", "verified", "townName", "phone", "whatsapp", "isOpen", "statusLine"]) {
      expect(demo.business).toHaveProperty(key);
      expect(mine.business).toHaveProperty(key);
    }
  });

  it("prices a running flash sale the way the customer page does", () => {
    const sale = { id: "f1", itemId: "it-1", discountType: "percent", discountValue: 20, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), headline: "Today" };
    const out = itemDetailOf({ item, shop, sale });
    expect(out.pricing).toMatchObject({ regularPrice: 500, salePrice: 400, savings: 100, discountPercent: 20 });
    expect(out.flash.sale.discount).toEqual({ type: "percent", value: 20 });
  });

  it("shows no seller sale price: customers only ever see the regular price or a flash sale", () => {
    const out = itemDetailOf({ item: { ...item, salePrice: 300 }, shop });
    expect(out.pricing.salePrice).toBe(500);
    expect(out.flash).toBeNull();
  });

  it("prices each option, and applies a running flash sale to every option", () => {
    const withOptions = { ...item, variants: [{ id: "s", label: "Small", price: 500, stock: 3 }, { id: "l", label: "Large", price: 800, stock: null }, { id: "x", label: "Gone", price: 900, stock: 0 }] };
    const plain = itemDetailOf({ item: withOptions, shop });
    expect(plain.pricing.variants.map((v) => [v.label, v.regularPrice, v.salePrice])).toEqual([["Small", 500, 500], ["Large", 800, 800]]);
    const sale = { id: "f1", itemId: "it-1", discountType: "percent", discountValue: 25, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() };
    const flash = itemDetailOf({ item: withOptions, shop, sale });
    expect(flash.pricing.variants.map((v) => [v.label, v.salePrice, v.discountPercent])).toEqual([["Small", 375, 25], ["Large", 600, 25]]);
  });

  it("only says how many are left when the customer page would", () => {
    const counted = { ...item, trackStock: true, showStockCount: true, stockCount: 2 };
    expect(itemDetailOf({ item: { ...counted, availability: "limited_stock" }, shop }).stockLeft).toBe(2);
    expect(itemDetailOf({ item: { ...counted, availability: "available" }, shop }).stockLeft).toBeNull();
  });

  it("uses the gallery given by the editor, photos and videos in order", () => {
    const out = itemDetailOf({ item, shop, gallery: [{ kind: "video", url: "v.mp4" }, { kind: "image", url: "p.png" }] });
    expect(out.media.map((m) => [m.id, m.kind])).toEqual([["v1", "video"], ["i1", "image"]]);
    expect(out.imageUrl).toBe("p.png");
  });
});
