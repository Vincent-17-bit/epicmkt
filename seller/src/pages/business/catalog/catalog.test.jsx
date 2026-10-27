import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemCard } from "@epicmkt/ui";
import { SORT_OPTIONS } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { M, signedInApp, setTime } from "../../../test/utils.jsx";
import { cardItemOf } from "./cardItem.js";

const LABELS = { was: "Was", lowStock: "Low stock", onlyLeft: "Only {n} left" };
const realMatchMedia = window.matchMedia;

const media = (desktop) => {
  window.matchMedia = (q) => ({ matches: desktop && q.includes("min-width: 1024px"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
};

const open = (path = "/business/catalog", prepare) => signedInApp(path, prepare);
const names = () => screen.queryAllByTestId("listing").map((li) => li.querySelector("[data-card] span[class*='name']")?.textContent ?? li.textContent);
const ids = () => screen.queryAllByTestId("listing").map((li) => li.dataset.id);
const count = () => screen.getByTestId("result-count").textContent;
const ready = async () => screen.findByTestId("listing-grid");
const gone = () => within(screen.getByTestId("out-of-stock-grid")).queryAllByTestId("listing").map((li) => li.dataset.id);
const live = () => within(screen.getByTestId("listing-grid")).queryAllByTestId("listing").map((li) => li.dataset.id);
const card = (id) => screen.getAllByTestId("listing").find((li) => li.dataset.id === id);
const tile = (key) => screen.getByTestId(`tile-${key}`);
const go = async (user, get) => {
  await waitFor(() => expect(get()).toBeEnabled());
  await user.click(get());
};
const openMenu = async (user, id) => {
  const trigger = within(card(id)).getByRole("button", { name: /^More actions/ });
  if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
  return within(card(id)).getByRole("menu");
};
const pngFile = (name, side = 300) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, side);
  new DataView(b.buffer).setUint32(20, side);
  return new File([b], name, { type: "image/png" });
};
const tileCount = (key) => Number(within(tile(key)).getByText(/^\d+$/).textContent);

const make = (n, extra = {}) => ({
  id: `x${n}`, name: `Product ${n}`, price: 100 + n, priceType: "fixed", availability: "available", visible: true, hiddenByAdmin: false, description: "", section: `S${n % 4}`,
  priceMax: null, unit: null, salePrice: null, stockCount: null, trackStock: false, lowStockThreshold: 3, showStockCount: false, availableFrom: null, season: null,
  draft: false, sort: n, removedByAdmin: false, adminHideReason: null, tags: [], badge: null, variants: [], priceConfirmedAt: new Date().toISOString(),
  createdAt: new Date(Date.now() - n * 1000).toISOString(), updatedAt: new Date(Date.now() - n * 1000).toISOString(), imageCount: 1, imagePaths: [`p/${n}.webp`], hasVideo: false, ...extra,
});

beforeEach(() => {
  media(true);
  try { localStorage.clear(); } catch { /* none */ }
});
afterEach(() => {
  vi.unstubAllEnvs();
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
});

describe("listing cards and summary", () => {
  it("shows every item with the real customer card and the seller overlay", async () => {
    await open();
    await ready();
    expect(screen.getAllByTestId("listing")).toHaveLength(6);
    const first = card("it-fade");
    const seller = first.querySelector("[data-card]");
    const bare = render(<ItemCard item={cardItemOf(M.state.items[0])} labels={LABELS} />).container.querySelector("[data-card]");
    expect(seller.outerHTML).toBe(bare.outerHTML);
    // Available is the normal state, so the card says it once (the seller's own chip) and the customer card says nothing.
    expect(within(first).getAllByText("Available")).toHaveLength(1);
    expect(within(first).getByRole("button", { name: /^Edit/ })).toBeInTheDocument();
    const menu = await openMenu(userEvent.setup(), "it-fade");
    for (const label of ["Duplicate", "Hide", "Confirm price", "View as customer"]) {
      expect(within(menu).getByRole("menuitem", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
  });

  it("says how many items are showing to customers and why the others are not", async () => {
    await open();
    await ready();
    const strip = screen.getByTestId("showing-summary");
    expect(strip).toHaveTextContent("4 of 6 items are showing to customers");
    expect(strip).toHaveTextContent("1 out of stock");
    expect(strip).toHaveTextContent("1 hidden by you");
  });

  it("marks hidden by me, hidden by admin, removed, drafts, flagged and reported items", async () => {
    await open("/business/catalog", async () => {
      M.state.items[0].hiddenByAdmin = true;
      M.state.items[0].adminHideReason = "Misleading photo";
      M.state.items[1].removedByAdmin = true;
      M.state.items[1].adminHideReason = "Prohibited item";
      M.state.items[2].draft = true;
      M.state.items[2].visible = false;
      M.setSignals([{ itemId: "it-dye", openFlags: 0, reports30d: 2 }, { itemId: "it-gel", openFlags: 1, reports30d: 1 }]);
    });
    await ready();
    expect(screen.getByTestId("ribbon-it-fade")).toHaveTextContent("Hidden by admin: Misleading photo");
    expect(screen.getByTestId("ribbon-it-fade").className).toMatch(/Danger/);
    expect(screen.getByTestId("ribbon-it-beard")).toHaveTextContent("Removed by admin: Prohibited item");
    expect(screen.getByTestId("ribbon-it-dye")).toHaveTextContent("Draft");
    expect(screen.getByTestId("ribbon-it-old")).toHaveTextContent("Hidden by you");
    expect(within(card("it-dye")).getByText("2 reports")).toBeInTheDocument();
    expect(within(card("it-gel")).getByText("1 report")).toBeInTheDocument();
    expect(within(card("it-gel")).getByRole("img", { name: "Flagged, 1 open" })).toBeInTheDocument();
    expect(within(card("it-gel")).getByText("Price may be out of date")).toBeInTheDocument();
    const user = userEvent.setup();
    expect(within(await openMenu(user, "it-fade")).getByRole("menuitem", { name: /^Hide/ })).toBeDisabled();
    expect(within(card("it-beard")).getByRole("button", { name: /^Edit/ })).toBeDisabled();
    expect(screen.getByTestId("showing-summary")).toHaveTextContent("1 of 6 items are showing to customers");
    expect(screen.getByTestId("showing-summary")).toHaveTextContent("2 hidden by admin");
    expect(screen.getByTestId("showing-summary")).toHaveTextContent("1 draft");
  });

  it("explains a shop that is not live and counts nothing as showing", async () => {
    await open("/business/catalog", async () => M.setBusiness({ status: "paused" }));
    await ready();
    expect(screen.getByTestId("shop-not-live")).toHaveTextContent("Your shop is not live");
    expect(screen.getByTestId("showing-summary")).toHaveTextContent("0 of 6 items are showing to customers");
    expect(screen.getByTestId("showing-summary")).toHaveTextContent("4 not showing because your shop is not live");
  });

  it("opens the shop preview from View as customer", async () => {
    await open();
    await ready();
    const link = within(await openMenu(userEvent.setup(), "it-fade")).getByRole("menuitem", { name: /^View as customer/ });
    expect(link).toHaveAttribute("href", "/business/preview");
    expect(link).toHaveAttribute("target", "_blank");
  });
});

describe("tracker, search, filters and sort", () => {
  it("every tile count equals the number of items its click shows", async () => {
    const user = userEvent.setup();
    await open("/business/catalog", async () => {
      M.state.items[3].draft = true;
      M.setSignals([{ itemId: "it-dye", openFlags: 1, reports30d: 1 }]);
    });
    await ready();
    for (const key of ["total", "available", "limited_stock", "out_of_stock", "seasonal", "by_appointment", "coming_soon", "hidden_me", "hidden_admin", "draft", "no_photo", "stale_price", "low_stock", "reported", "flagged"]) {
      const expected = tileCount(key);
      await user.click(tile(key));
      await waitFor(() => expect(count()).toBe(`${expected} of 6 items`));
      expect(screen.queryAllByTestId("listing").length).toBe(expected);
    }
    expect(tileCount("draft")).toBe(1);
    expect(tileCount("no_photo")).toBe(1);
    expect(tileCount("stale_price")).toBe(1);
  });

  it("search matches partial words in name, tags, section and description, debounced, and / focuses it", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.keyboard("/");
    expect(screen.getByLabelText("Search listings")).toHaveFocus();
    await user.type(screen.getByLabelText("Search listings"), "bea");
    expect(count()).toBe("6 of 6 items");
    await waitFor(() => expect(count()).toBe("1 of 6 items"));
    expect(ids()).toEqual(["it-beard"]);
    await user.clear(screen.getByLabelText("Search listings"));
    await user.type(screen.getByLabelText("Search listings"), "barber");
    await waitFor(() => expect(ids()).toEqual(["it-fade"]));
    await user.clear(screen.getByLabelText("Search listings"));
    await user.type(screen.getByLabelText("Search listings"), "colour");
    await waitFor(() => expect(ids()).toEqual(["it-dye"]));
    await user.clear(screen.getByLabelText("Search listings"));
    await user.type(screen.getByLabelText("Search listings"), "hot towel");
    await waitFor(() => expect(ids()).toEqual(["it-fade"]));
  });

  it("filters stack, show removable chips and a result count, and clear all", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(screen.getByTestId("avail-out_of_stock"));
    await waitFor(() => expect(ids()).toEqual(["it-gel"]));
    expect(count()).toBe("1 of 6 items");
    await user.click(screen.getByTestId("vis-showing"));
    expect(ids()).toEqual(["it-gel"]);
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getByRole("button", { name: "Remove filter Out of stock" })).toBeInTheDocument();
    await user.click(within(chips).getByRole("button", { name: "Remove filter Out of stock" }));
    await waitFor(() => expect(count()).toBe("5 of 6 items"));
    await user.selectOptions(screen.getByLabelText("Section"), "Haircuts");
    await waitFor(() => expect(ids().sort()).toEqual(["it-beard", "it-fade"]));
    await user.type(screen.getByLabelText("Minimum price"), "400");
    await waitFor(() => expect(ids()).toEqual(["it-fade"]));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(count()).toBe("6 of 6 items"));
    expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
  });

  it("on sale, stale price and no photo filters work from the panel", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(screen.getByLabelText("On sale"));
    await waitFor(() => expect(ids()).toEqual(["it-beard"]));
    await user.click(screen.getByLabelText("On sale"));
    await user.click(screen.getByTestId("issues-stale_price"));
    await waitFor(() => expect(ids()).toEqual(["it-gel"]));
    await user.click(screen.getByTestId("issues-stale_price"));
    await user.click(screen.getByTestId("issues-no_photo"));
    await waitFor(() => expect(ids()).toEqual(["it-dye"]));
  });

  it("offers every sort and orders the cards accordingly", async () => {
    await open();
    await ready();
    const sort = screen.getByLabelText("Sort");
    expect([...sort.options].map((o) => o.value)).toEqual(SORT_OPTIONS.map((o) => o.key));
    fireEvent.change(sort, { target: { value: "name_desc" } });
    await waitFor(() => expect(ids()[0]).toBe("it-quote"));
    fireEvent.change(sort, { target: { value: "price_desc" } });
    await waitFor(() => expect(live().slice(0, 3)).toEqual(["it-dye", "it-fade", "it-beard"]));
    // The out of stock item (it-gel) is in its own section whatever the sort.
    expect(gone()).toEqual(["it-gel"]);
    fireEvent.change(sort, { target: { value: "avail_out_first" } });
    await waitFor(() => expect(gone()).toEqual(["it-gel"]));
    fireEvent.change(sort, { target: { value: "stale_first" } });
    await waitFor(() => expect(gone()).toEqual(["it-gel"]));
  });

  it("restores filters, search and sort from the URL", async () => {
    await open("/business/catalog?avail=available&sort=price_desc&min=400&q=cut");
    await ready();
    expect(screen.getByLabelText("Sort")).toHaveValue("price_desc");
    expect(screen.getByLabelText("Search listings")).toHaveValue("cut");
    expect(screen.getByTestId("avail-available")).toBeChecked();
    expect(screen.getByLabelText("Minimum price")).toHaveValue(400);
    expect(ids()).toEqual(["it-fade"]);
  });
});

describe("saved views", () => {
  it("saves, applies, validates names and deletes", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(screen.getByTestId("avail-out_of_stock"));
    await waitFor(() => expect(count()).toBe("1 of 6 items"));
    await user.click(screen.getByRole("button", { name: "Save this view" }));
    await user.type(screen.getByLabelText("View name"), "<bad>");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/letters, numbers/);
    await user.clear(screen.getByLabelText("View name"));
    await user.type(screen.getByLabelText("View name"), "Out of stock");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(M.state.views).toHaveLength(1));
    expect(M.state.views[0]).toMatchObject({ name: "Out of stock", query: "avail=out_of_stock" });
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(count()).toBe("6 of 6 items"));
    await user.selectOptions(screen.getByLabelText("Saved views"), await screen.findByRole("option", { name: "Out of stock" }));
    await waitFor(() => expect(count()).toBe("1 of 6 items"));
    await user.click(screen.getByText(/Manage views/));
    await user.click(screen.getByRole("button", { name: "Delete view Out of stock" }));
    await waitFor(() => expect(M.state.views).toHaveLength(0));
  });

  it("allows at most ten views", async () => {
    const user = userEvent.setup();
    await open("/business/catalog", async () => {
      M.state.views = Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, name: `View ${i}`, query: "sort=name_asc" }));
    });
    await ready();
    expect(screen.getByRole("button", { name: "Save this view" })).toBeDisabled();
    await user.click(screen.getByText(/Manage views \(10 of 10\)/));
    expect(screen.getAllByRole("button", { name: /^Delete view/ })).toHaveLength(10);
  });
});

describe("view modes and layout", () => {
  it("remembers the view mode on this device and has a list mode with rows", async () => {
    const user = userEvent.setup();
    const first = await open();
    await ready();
    expect(screen.getByTestId("listing-grid")).toHaveAttribute("data-mode", "comfortable");
    await user.click(screen.getByRole("button", { name: "Compact" }));
    expect(screen.getByTestId("listing-grid")).toHaveAttribute("data-mode", "compact");
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByTestId("listing-grid")).toHaveAttribute("data-mode", "list");
    expect(card("it-fade").querySelector("[data-card]")).toBeNull();
    expect(screen.getAllByTestId("listing")).toHaveLength(6);
    first.unmount();
    await open();
    expect((await ready()).getAttribute("data-mode")).toBe("list");
  });

  it("uses two, three, four and five column grids at the required widths, with theme tokens only", () => {
    const css = readFileSync(resolve(process.cwd(), "src/pages/business/catalog/catalog.module.css"), "utf8");
    expect(css).toMatch(/\.grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(min-width: (?:600px|37\.5rem)\) \{\s*\.grid \{\s*grid-template-columns: repeat\(3/);
    expect(css).toMatch(/@media \(min-width: (?:1024px|64rem)\) \{\s*\.grid \{\s*grid-template-columns: repeat\(4/);
    expect(css).toMatch(/\.grid\.compact \{\s*grid-template-columns: repeat\(5/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
  });

  it("renders in both themes", async () => {
    for (const theme of ["light", "dark"]) {
      document.documentElement.setAttribute("data-theme", theme);
      const view = await open();
      await ready();
      expect(screen.getAllByTestId("listing")).toHaveLength(6);
      view.unmount();
    }
    document.documentElement.removeAttribute("data-theme");
  });

  it("paginates beyond 60 cards and filters 150 items quickly", async () => {
    const user = userEvent.setup();
    const start = performance.now();
    await open("/business/catalog", async () => {
      M.setItems(Array.from({ length: 150 }, (_, i) => make(i + 1, { section: `S${i % 4}`, tags: i % 10 === 0 ? ["featured"] : [] })));
    });
    await ready();
    expect(screen.getAllByTestId("listing")).toHaveLength(60);
    expect(screen.getByText("Showing 60 of 150")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 60 more" }));
    expect(screen.getAllByTestId("listing")).toHaveLength(120);
    await user.click(screen.getByRole("button", { name: "Show 30 more" }));
    expect(screen.getAllByTestId("listing")).toHaveLength(150);
    const before = performance.now();
    await user.selectOptions(screen.getByLabelText("Section"), "S1");
    await waitFor(() => expect(count()).toMatch(/^3[78] of 150/));
    expect(performance.now() - before).toBeLessThan(1500);
    expect(performance.now() - start).toBeLessThan(15000);
    // The body allows itself 15 s, so the test's own timeout must be longer than that (vitest's default is 5 s).
  }, 30000);
});

describe("phone filter sheet", () => {
  it("opens from a Filters button and applies or resets", async () => {
    media(false);
    const user = userEvent.setup();
    await open();
    await ready();
    expect(screen.queryByRole("complementary", { name: "Filters" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await user.click(within(dialog).getByTestId("avail-out_of_stock"));
    expect(count()).toBe("6 of 6 items");
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));
    expect(within(dialog).getByTestId("avail-out_of_stock")).not.toBeChecked();
    await user.click(within(dialog).getByTestId("avail-out_of_stock"));
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(ids()).toEqual(["it-gel"]));
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });
});

describe("quick actions", () => {
  it("hides and shows, confirms a price, and duplicates as a draft", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await openMenu(user, "it-fade");
    await go(user, () => within(card("it-fade")).getByRole("menuitem", { name: /^Hide/ }));
    await waitFor(() => expect(M.state.items[0].visible).toBe(false));
    await waitFor(() => expect(screen.getByTestId("ribbon-it-fade")).toHaveTextContent("Hidden by you"));
    await openMenu(user, "it-fade");
    await go(user, () => within(card("it-fade")).getByRole("menuitem", { name: /^Show/ }));
    await waitFor(() => expect(M.state.items[0].visible).toBe(true));
    await openMenu(user, "it-gel");
    await go(user, () => within(card("it-gel")).getByRole("menuitem", { name: /^Confirm price/ }));
    await waitFor(() => expect(Date.now() - Date.parse(M.state.items[3].priceConfirmedAt)).toBeLessThan(60000));
    await waitFor(() => expect(within(card("it-gel")).queryByText("Price may be out of date")).toBeNull());
    await openMenu(user, "it-fade");
    await go(user, () => within(card("it-fade")).getByRole("menuitem", { name: /^Duplicate/ }));
    await waitFor(() => expect(M.state.items).toHaveLength(7));
    expect(M.state.items[6]).toMatchObject({ name: "Fade cut (copy)", draft: true, visible: false });
    expect((await screen.findAllByText("Fade cut (copy)")).length).toBeGreaterThan(0);
  });

  it("moves items up and down in manual order", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    expect(ids().slice(0, 2)).toEqual(["it-fade", "it-beard"]);
    await openMenu(user, "it-fade");
    await user.click(screen.getByRole("menuitem", { name: "Move Fade cut down" }));
    await waitFor(() => expect(ids().slice(0, 2)).toEqual(["it-beard", "it-fade"]));
    await openMenu(user, "it-beard");
    expect(screen.getByRole("menuitem", { name: "Move Beard trim up" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "name_asc" } });
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: /^Move .* down$/ })).toBeNull());
  });

  it("adds and edits an item with validation", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add item" });
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(within(dialog).getAllByRole("alert").length).toBeGreaterThan(0);
    await user.type(within(dialog).getByLabelText("Name"), "Shave");
    await user.type(within(dialog).getByLabelText("Price (KES)"), "450");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Shave", price: 450, draft: true, visible: false }));
    const made = (await screen.findAllByText("Shave"))[0].closest("li");
    await go(user, () => within(made).getByRole("button", { name: /^Edit/ }));
    const edit = await screen.findByRole("dialog", { name: "Edit item" });
    await user.clear(within(edit).getByLabelText("Price (KES)"));
    await user.type(within(edit).getByLabelText("Price (KES)"), "500");
    await user.click(within(edit).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(M.state.items.at(-1).price).toBe(500));
  });

  it("adds specification rows, marks the incomplete row, and saves them", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add item" });
    expect(within(dialog).queryByLabelText("Label")).toBeNull();
    await user.type(within(dialog).getByLabelText("Name"), "Sneaker");
    await user.type(within(dialog).getByLabelText("Price (KES)"), "4500");
    await user.click(within(dialog).getByRole("button", { name: "Add specification" }));
    await user.type(within(dialog).getByLabelText("Label"), "Brand");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(within(dialog).getAllByRole("alert").map((a) => a.textContent)).toContain("Add a value.");
    expect(within(dialog).getByLabelText("Value").getAttribute("aria-invalid")).toBe("true");
    expect(within(dialog).getByLabelText("Label").getAttribute("aria-invalid")).not.toBe("true");
    await user.type(within(dialog).getByLabelText("Value"), "Nike");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Sneaker", specs: [{ label: "Brand", value: "Nike" }] }));
  });

  it("puts a specification in a chosen group, defaults to Features & Specs, and keeps the group when editing", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add item" });
    await user.type(within(dialog).getByLabelText("Name"), "Desk lamp");
    await user.type(within(dialog).getByLabelText("Price (KES)"), "2400");
    await user.click(within(dialog).getByRole("button", { name: "Add specification" }));
    await user.click(within(dialog).getByRole("button", { name: "Add specification" }));
    const groups = within(dialog).getAllByLabelText("Group");
    expect(groups.map((g) => g.value)).toEqual(["Features & Specs", "Features & Specs"]);
    expect(within(dialog).getAllByRole("option", { name: "Measurements" })).toHaveLength(2);
    await user.selectOptions(groups[1], "Measurements");
    const labels = within(dialog).getAllByLabelText("Label");
    const values = within(dialog).getAllByLabelText("Value");
    await user.type(labels[0], "Bulb");
    await user.type(values[0], "E27");
    await user.type(labels[1], "Height");
    await user.type(values[1], "45 cm");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({
      name: "Desk lamp",
      specs: [{ group: "Features & Specs", label: "Bulb", value: "E27" }, { group: "Measurements", label: "Height", value: "45 cm" }],
    }));
    const made = (await screen.findAllByText("Desk lamp"))[0].closest("li");
    await go(user, () => within(made).getByRole("button", { name: /^Edit/ }));
    const edit = await screen.findByRole("dialog", { name: "Edit item" });
    expect(within(edit).getAllByLabelText("Group").map((g) => g.value)).toEqual(["Features & Specs", "Measurements"]);
    await user.selectOptions(within(edit).getAllByLabelText("Group")[0], "User guide");
    await user.click(within(edit).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(M.state.items.at(-1).specs.map((r) => r.group)).toEqual(["User guide", "Measurements"]));
  });

  it("saves brand, short description, pack size, highlights, what's included and terms, and loads them again", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add item" });
    await user.type(within(dialog).getByLabelText("Name"), "Birthday cake");
    await user.type(within(dialog).getByLabelText("Price (KES)"), "1800");
    await user.type(within(dialog).getByLabelText("Brand (optional)"), "Acme Bakers");
    await user.type(within(dialog).getByLabelText("Short description (optional)"), "Soft vanilla sponge");
    await user.type(within(dialog).getByLabelText("Pack size (optional)"), "Serves 10");
    await user.type(within(dialog).getByLabelText("Terms (optional)"), "Order two days ahead");
    await user.click(within(dialog).getByRole("button", { name: "Add highlight" }));
    await user.type(within(dialog).getByLabelText("Highlight 1 title"), "Fresh");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(within(dialog).getAllByRole("alert").map((a) => a.textContent)).toContain("Add the highlight text.");
    expect(within(dialog).getByLabelText("Highlight 1 text").getAttribute("aria-invalid")).toBe("true");
    await user.type(within(dialog).getByLabelText("Highlight 1 text"), "Baked the same day");
    await user.click(within(dialog).getByRole("button", { name: "Add included item" }));
    await user.type(within(dialog).getByLabelText("Included item 1"), "Candles");
    await user.click(within(dialog).getByRole("button", { name: "Add included item" }));
    await user.type(within(dialog).getByLabelText("Included item 2"), "Cake box");
    await user.click(within(dialog).getByRole("button", { name: "Remove included item 2" }));
    expect(within(dialog).queryByLabelText("Included item 2")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({
      name: "Birthday cake", brand: "Acme Bakers", shortDescription: "Soft vanilla sponge", packSize: "Serves 10", terms: "Order two days ahead",
      includes: ["Candles"], highlights: [{ title: "Fresh", text: "Baked the same day" }],
    }));
    const made = (await screen.findAllByText("Birthday cake"))[0].closest("li");
    await go(user, () => within(made).getByRole("button", { name: /^Edit/ }));
    const edit = await screen.findByRole("dialog", { name: "Edit item" });
    expect(within(edit).getByLabelText("Brand (optional)").value).toBe("Acme Bakers");
    expect(within(edit).getByLabelText("Highlight 1 text").value).toBe("Baked the same day");
    expect(within(edit).getByLabelText("Included item 1").value).toBe("Candles");
    await user.clear(within(edit).getByLabelText("Brand (optional)"));
    await user.click(within(edit).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ brand: null, packSize: "Serves 10", highlights: [{ title: "Fresh", text: "Baked the same day" }] }));
  });

  it("adds photos to a new item, to an existing item, and removes one", async () => {
    const user = userEvent.setup();
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:photo-${++n}`);
    URL.revokeObjectURL = vi.fn();
    await open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add item" });
    await user.type(within(dialog).getByLabelText("Name"), "Photo item");
    await user.type(within(dialog).getByLabelText("Price (KES)"), "100");
    const input = dialog.querySelector('input[type="file"]');
    await user.upload(input, [pngFile("a.png"), pngFile("b.png")]);
    await waitFor(() => expect(within(dialog).getAllByRole("button", { name: /^Remove photo/ })).toHaveLength(2));
    expect(within(dialog).getByText("Cover")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove photo 2" }));
    expect(within(dialog).getAllByRole("button", { name: /^Remove photo/ })).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Photo item", imageCount: 1 }));
    const made = M.state.items.at(-1);
    await go(user, () => within(card(made.id)).getByRole("button", { name: /^Edit/ }));
    const edit = await screen.findByRole("dialog", { name: "Edit item" });
    expect(within(edit).getAllByRole("button", { name: /^Remove photo/ })).toHaveLength(1);
    await user.upload(edit.querySelector('input[type="file"]'), pngFile("c.png"));
    await waitFor(() => expect(made.imageCount).toBe(2));
    expect(within(edit).getAllByRole("button", { name: /^Remove photo/ })).toHaveLength(2);
    await user.click(within(edit).getByRole("button", { name: "Remove photo 1" }));
    await waitFor(() => expect(made.imageCount).toBe(1));
    expect(within(edit).getAllByRole("button", { name: /^Remove photo/ })).toHaveLength(1);
  });

  it("rejects a file that is not an image or is too small", async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    await open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add item" });
    const input = dialog.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(40)], "x.png", { type: "image/png" }), pngFile("tiny.png", 50)] } });
    expect(await within(dialog).findByText(/x\.png: Use a JPG, PNG or WebP image/)).toBeInTheDocument();
    expect(within(dialog).getByText(/tiny\.png: Each image must be at least 200 pixels/)).toBeInTheDocument();
    expect(within(dialog).queryAllByRole("button", { name: /^Remove photo/ })).toHaveLength(0);
  });

  it("locks the price of an item in a flash sale but lets everything else save", async () => {
    const user = userEvent.setup();
    let target;
    await open("/business/catalog", async () => {
      setTime("2026-10-17T09:00:00.000Z");
      target = M.state.items.find((i) => i.priceType === "fixed" && i.price && i.visible && !i.removedByAdmin && !i.hiddenByAdmin);
      await api.createFlashSale({ itemId: target.id, discountType: "percent", discountValue: 20, endsAt: "2026-10-17T15:00:00Z", afterEnd: "keep" });
    });
    await ready();
    const before = target.price;
    await go(user, () => within(card(target.id)).getByRole("button", { name: /^Edit/ }));
    const edit = await screen.findByRole("dialog", { name: "Edit item" });
    await user.clear(within(edit).getByLabelText("Price (KES)"));
    await user.type(within(edit).getByLabelText("Price (KES)"), String(before + 100));
    await user.click(within(edit).getByRole("button", { name: "Save changes" }));
    expect(await within(edit).findByRole("alert")).toHaveTextContent(/flash sale/i);
    expect(M.state.items.find((i) => i.id === target.id).price).toBe(before);
    await user.clear(within(edit).getByLabelText("Price (KES)"));
    await user.type(within(edit).getByLabelText("Price (KES)"), String(before));
    await user.type(within(edit).getByLabelText("Name"), " promo");
    await user.click(within(edit).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(M.state.items.find((i) => i.id === target.id).name).toMatch(/promo$/));
  });
});

describe("bulk tools", () => {
  const pick = async (user, ...list) => {
    for (const id of list) await user.click(within(card(id)).getByRole("checkbox"));
  };

  it("hides and shows selected items and moves them to a section", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await pick(user, "it-fade", "it-beard");
    expect(screen.getByTestId("bulk-bar")).toHaveTextContent("2 selected");
    await go(user, () => within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(M.state.items.slice(0, 2).every((i) => !i.visible)).toBe(true));
    await go(user, () => within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Show" }));
    await waitFor(() => expect(M.state.items.slice(0, 2).every((i) => i.visible)).toBe(true));
    await pick(user, "it-beard", "it-gel");
    expect(screen.getByTestId("bulk-bar")).toHaveTextContent("2 selected");
    await go(user, () => within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Move to section" }));
    const dialog = await screen.findByRole("dialog", { name: "Move to section" });
    await user.type(within(dialog).getByLabelText("Section name"), "Specials");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect([M.state.items[0].section, M.state.items[3].section]).toEqual(["Specials", "Specials"]));
  });

  it("sets availability for the selection", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await pick(user, "it-fade", "it-dye");
    await user.click(within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Set availability" }));
    const dialog = await screen.findByRole("dialog", { name: "Set availability" });
    await user.selectOptions(within(dialog).getByLabelText("Availability"), "limited_stock");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect([M.state.items[0].availability, M.state.items[2].availability]).toEqual(["limited_stock", "limited_stock"]));
  });

  it("previews a percentage price change and the result equals the preview", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(within(card("it-fade")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("bulk-bar")).getByRole("button", { name: /^Select all/ }));
    await user.click(within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Change prices" }));
    const dialog = await screen.findByRole("dialog", { name: "Change prices" });
    expect(within(dialog).getByRole("button", { name: "Change prices" })).toBeDisabled();
    expect(within(dialog).getByText(/rounded to the nearest whole KES/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Percent change"), "400");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/at most 300/);
    await user.clear(within(dialog).getByLabelText("Percent change"));
    await user.type(within(dialog).getByLabelText("Percent change"), "10");
    const preview = await within(dialog).findByTestId("price-preview");
    expect(preview).toHaveTextContent("5 items change, 1 skipped");
    const shown = Object.fromEntries(M.state.items.filter((i) => i.price !== null).map((i) => [i.id, within(preview).getByTestId(`after-${i.id}`).textContent]));
    expect(shown["it-fade"]).toBe("KES 550");
    await user.click(within(dialog).getByRole("button", { name: "Change 5 prices" }));
    await waitFor(() => expect(M.state.items[0].price).toBe(550));
    for (const i of M.state.items.filter((x) => x.price !== null)) expect(`KES ${i.price.toLocaleString("en-KE")}`).toBe(shown[i.id]);
    expect(M.state.items[1].salePrice).toBe(275);
    expect(M.state.items[5].price).toBeNull();
  });

  it("skips items in a flash sale in the preview and in the result", async () => {
    const user = userEvent.setup();
    await open("/business/catalog", async () => {
      setTime("2026-10-17T09:00:00.000Z");
      await api.createFlashSale({ itemId: "it-fade", discountType: "percent", discountValue: 20, endsAt: "2026-10-17T15:00:00Z", afterEnd: "keep" });
    });
    await ready();
    const before = M.state.items.find((i) => i.id === "it-fade").price;
    const others = Object.fromEntries(M.state.items.filter((i) => i.id !== "it-fade").map((i) => [i.id, i.price]));
    await user.click(within(card("it-fade")).getByRole("checkbox"));
    await user.click(within(screen.getByTestId("bulk-bar")).getByRole("button", { name: /^Select all/ }));
    await user.click(within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Change prices" }));
    const dialog = await screen.findByRole("dialog", { name: "Change prices" });
    await user.type(within(dialog).getByLabelText("Percent change"), "10");
    const preview = await within(dialog).findByTestId("price-preview");
    expect(preview).toHaveTextContent("4 items change, 2 skipped");
    expect(preview).toHaveTextContent(/flash sale/);
    expect(within(preview).queryByTestId("after-it-fade")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Change 4 prices" }));
    await waitFor(() => expect(M.state.items.filter((i) => i.id !== "it-fade" && i.price !== null && i.priceType !== "free").every((i) => i.price !== others[i.id])).toBe(true));
    expect(M.state.items.find((i) => i.id === "it-fade").price).toBe(before);
  });

  it("deletes with Undo, and commits the delete if the page is left", async () => {
    const user = userEvent.setup();
    const view = await open();
    await ready();
    await pick(user, "it-old", "it-quote");
    await user.click(within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByTestId("undo-bar")).toHaveTextContent("2 items deleted.");
    expect(ids()).not.toContain("it-old");
    expect(count()).toBe("4 of 4 items");
    await user.click(within(screen.getByTestId("undo-bar")).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(count()).toBe("6 of 6 items"));
    expect(M.state.items).toHaveLength(6);
    await pick(user, "it-old");
    await user.click(within(screen.getByTestId("bulk-bar")).getByRole("button", { name: "Delete" }));
    await screen.findByTestId("undo-bar");
    view.unmount();
    await waitFor(() => expect(M.state.items.map((i) => i.id)).not.toContain("it-old"));
  });
});

describe("paste and CSV import", () => {
  const importButton = () => screen.getByRole("button", { name: /^Import items/ });
  const rows = (...lines) => ["name\tprice type\tprice\tunit\tavailability\tsection\ttags", ...lines].join("\n");

  it("is locked on Standard with an upgrade prompt", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(importButton());
    const locked = await screen.findByTestId("import-locked");
    expect(locked).toHaveTextContent("Import is part of Premium");
    expect(within(locked).getByRole("link", { name: "See plans and upgrade" })).toHaveAttribute("href", "/business/subscription");
    expect(screen.queryByLabelText("Paste rows")).toBeNull();
  });

  it("validates each row before import, refuses formulas and creates drafts", async () => {
    const user = userEvent.setup();
    await open("/business/catalog", async () => M.setBusiness({ planKey: "premium" }));
    await ready();
    await user.click(importButton());
    const dialog = await screen.findByRole("dialog", { name: "Import items" });
    fireEvent.change(within(dialog).getByLabelText("Paste rows"), { target: { value: rows("Haircut\tfixed\t500\tper cut\tavailable\tCuts\tbarber", "=SUM(A1)\tfixed\t10\t\t\t\t", "Bad price\tfixed\tabc\t\t\t\t", "Shave\tfixed\t300\t\tby appointment\t\t") } });
    await user.click(within(dialog).getByRole("button", { name: "Preview" }));
    expect(await within(dialog).findByTestId("import-summary")).toHaveTextContent("2 ready to import, 2 rejected, 4 rows in total.");
    const rejected = within(dialog).getByTestId("import-rejected");
    expect(rejected).toHaveTextContent("spreadsheet formula");
    expect(rejected).toHaveTextContent("must be a number");
    expect(within(dialog).getByLabelText("Price column")).toHaveValue("2");
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    await user.click(within(dialog).getByRole("button", { name: "Download error report" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Import 2 items" }));
    await waitFor(() => expect(M.state.items).toHaveLength(8));
    expect(M.state.items.slice(6).map((i) => [i.name, i.draft, i.visible, i.availability])).toEqual([["Haircut", true, false, "available"], ["Shave", true, false, "by_appointment"]]);
    expect(await screen.findByText("2 items imported as drafts.")).toBeInTheDocument();
  });

  it("has no plan limit on how many items can be imported", async () => {
    const user = userEvent.setup();
    await open("/business/catalog", async () => {
      M.setBusiness({ planKey: "premium" });
      M.setItems(Array.from({ length: 98 }, (_, i) => make(i + 1)));
    });
    await ready();
    expect(await screen.findByText(/98 items listed\. No limit\./)).toBeInTheDocument();
    await user.click(importButton());
    const dialog = await screen.findByRole("dialog", { name: "Import items" });
    fireEvent.change(within(dialog).getByLabelText("Paste rows"), { target: { value: rows("One more\tfixed\t10\t\t\t\t", "Two more\tfixed\t10\t\t\t\t", "Three more\tfixed\t10\t\t\t\t") } });
    await user.click(within(dialog).getByRole("button", { name: "Preview" }));
    expect(await within(dialog).findByTestId("import-summary")).toHaveTextContent("3 ready to import");
    expect(within(dialog).queryByTestId("import-rejected")).not.toBeInTheDocument();
  });

  it("accepts a CSV file and rejects oversize and wrong-type files", async () => {
    const user = userEvent.setup({ applyAccept: false });
    await open("/business/catalog", async () => M.setBusiness({ planKey: "premium" }));
    await ready();
    await user.click(importButton());
    const dialog = await screen.findByRole("dialog", { name: "Import items" });
    await user.click(within(dialog).getByRole("tab", { name: "Upload CSV" }));
    const input = within(dialog).getByLabelText("CSV file");
    await user.upload(input, new File(["x".repeat(10)], "items.xlsx", { type: "application/vnd.ms-excel" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Upload a .csv file.");
    const big = new File(["x"], "big.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 2 * 1024 * 1024 + 1 });
    await user.upload(input, big);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("over 2 MB");
    await user.upload(input, new File(['name,price\n"Cake, large",1500\n'], "items.csv", { type: "text/csv" }));
    expect(await within(dialog).findByTestId("import-summary")).toHaveTextContent("1 ready to import, 0 rejected");
  });
});

describe("empty states", () => {
  it("guides a seller with no items", async () => {
    await open("/business/catalog", async () => M.setItems([]));
    const start = await screen.findByTestId("empty-start");
    expect(start).toHaveTextContent("Add your first item");
    expect(screen.queryByTestId("listing-grid")).toBeNull();
  });

  it("offers to clear filters when nothing matches", async () => {
    const user = userEvent.setup();
    await open("/business/catalog?q=zzzz");
    const empty = await screen.findByTestId("empty-results");
    expect(empty).toHaveTextContent("No items match");
    await user.click(within(empty).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getAllByTestId("listing")).toHaveLength(6));
  });
});

describe("out of stock", () => {
  it("keeps out of stock items together in their own section, away from the live items", async () => {
    await open();
    await ready();
    expect(live()).not.toContain("it-gel");
    expect(gone()).toEqual(["it-gel"]);
    const section = screen.getByTestId("out-of-stock-section");
    expect(within(section).getByRole("heading", { name: /Out of stock/ })).toBeInTheDocument();
    expect(within(section).getByText(/Customers cannot see these/)).toBeInTheDocument();
    expect(within(within(section).getByTestId("listing")).getByRole("button", { name: /^Back in stock/ })).toBeInTheDocument();
  });

  it("has no out of stock section when nothing is out of stock", async () => {
    await open("/business/catalog", async () => { M.state.items.find((i) => i.id === "it-gel").availability = "available"; M.state.items.find((i) => i.id === "it-gel").stockCount = 5; });
    await ready();
    expect(screen.queryByTestId("out-of-stock-section")).toBeNull();
  });

  it("marks an item out of stock from its menu, and brings it back with one tap", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    const menu = await openMenu(user, "it-fade");
    await user.click(within(menu).getByRole("menuitem", { name: "Mark out of stock" }));
    await waitFor(() => expect(gone()).toContain("it-fade"));
    expect(M.state.items.find((i) => i.id === "it-fade").availability).toBe("out_of_stock");
    expect(live()).not.toContain("it-fade");
    expect(await screen.findByText(/Fade cut is out of stock/)).toBeInTheDocument();

    await user.click(within(card("it-fade")).getByRole("button", { name: /^Back in stock/ }));
    await waitFor(() => expect(live()).toContain("it-fade"));
    expect(M.state.items.find((i) => i.id === "it-fade").availability).toBe("available");
  });

  it("does not offer Mark out of stock on an item that already is", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    const menu = await openMenu(user, "it-gel");
    expect(within(menu).queryByRole("menuitem", { name: "Mark out of stock" })).toBeNull();
  });

  it("asks how many you have for an item whose stock is counted, and will not accept 0", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(within(card("it-gel")).getByRole("button", { name: /^Back in stock/ }));
    const dialog = await screen.findByRole("dialog", { name: "Back in stock" });
    const apply = within(dialog).getByRole("button", { name: "List it again" });
    expect(apply).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Stock count"), "0");
    expect(apply).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Stock count"));
    await user.type(within(dialog).getByLabelText("Stock count"), "12");
    await user.click(apply);
    await waitFor(() => expect(live()).toContain("it-gel"));
    expect(M.state.items.find((i) => i.id === "it-gel")).toMatchObject({ stockCount: 12, availability: "available" });
  });

  it("lists an item as low stock when the count is at or under the warning level", async () => {
    const user = userEvent.setup();
    await open();
    await ready();
    await user.click(within(card("it-gel")).getByRole("button", { name: /^Back in stock/ }));
    const dialog = await screen.findByRole("dialog", { name: "Back in stock" });
    await user.type(within(dialog).getByLabelText("Stock count"), "2");
    await user.click(within(dialog).getByRole("button", { name: "List it again" }));
    await waitFor(() => expect(M.state.items.find((i) => i.id === "it-gel").availability).toBe("limited_stock"));
    await waitFor(() => expect(live()).toContain("it-gel"));
    expect(within(card("it-gel")).getByText("Low stock")).toBeInTheDocument();
  });
});

describe("stock fields in the item form", () => {
  const openForm = async (user) => {
    await open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    return screen.findByRole("dialog", { name: "Add item" });
  };

  it("offers Available, Low stock, Out of stock and By appointment, and not Unavailable", async () => {
    const dialog = await openForm(userEvent.setup());
    const labels = [...within(dialog).getByLabelText("Availability").options].map((o) => o.textContent);
    expect(labels).toEqual(["Available", "Low stock", "Out of stock", "By appointment"]);
  });

  it("saves a counted item, and the count decides its status", async () => {
    const user = userEvent.setup();
    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText("Name"), "Fresh cake");
    await user.type(within(dialog).getByLabelText("Price (KES)"), "900");
    await user.click(within(dialog).getByLabelText("Count my stock"));
    expect(within(dialog).queryByLabelText("Availability")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(await within(dialog).findByText(/Enter how many you have/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("How many do you have now?"), "2");
    expect(within(dialog).getByTestId("stock-result")).toHaveTextContent("Low stock");
    await user.click(within(dialog).getByLabelText(/show customers how many are left/));
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Fresh cake", trackStock: true, stockCount: 2, showStockCount: true, availability: "limited_stock" }));
  });

  it("shows Out of stock for a count of 0 before saving", async () => {
    const user = userEvent.setup();
    const dialog = await openForm(user);
    await user.click(within(dialog).getByLabelText("Count my stock"));
    await user.type(within(dialog).getByLabelText("How many do you have now?"), "0");
    expect(within(dialog).getByTestId("stock-result")).toHaveTextContent("Out of stock");
  });
});
