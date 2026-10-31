import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyItemForm, validateItemForm } from "@epicmkt/shared";
import { M, signedInApp } from "../../../../test/utils.jsx";
import { errorList, exampleShortFor, firstErrorTarget, firstSentence, GENERIC_EXAMPLE, priceSummary, qualityChecks, qualityScore, stockStatusOf } from "./model.js";

const realMatchMedia = window.matchMedia;

// A screen of a given width in px. The editor's breakpoints are rem queries (16px per rem).
const viewport = (px) => {
  window.matchMedia = (q) => {
    const m = /\((min|max)-width:\s*([\d.]+)rem\)/.exec(q);
    const edge = m ? Number(m[2]) * 16 : 0;
    const matches = m ? (m[1] === "min" ? px >= edge : px <= edge) : false;
    return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
};

const form = (extra = {}) => ({ ...emptyItemForm(), ...extra });
const openNew = async (width = 1000) => {
  viewport(width);
  const app = await signedInApp("/business/catalog/new");
  await screen.findByRole("heading", { level: 1, name: "Add item" });
  return app;
};
const headerButton = (name) => screen.getByRole("button", { name });
const draftKey = "seller.itemDraft.v1:new";

beforeEach(() => viewport(1000));
afterEach(() => { window.matchMedia = realMatchMedia; });

describe("editor rules", () => {
  it("takes the first sentence of a description and fits it into 140 characters", () => {
    expect(firstSentence("Fresh bread baked daily. Made with love.")).toBe("Fresh bread baked daily.");
    expect(firstSentence("  One   line\nwith breaks!  Then more. ")).toBe("One line with breaks!");
    expect(firstSentence("No full stop here")).toBe("No full stop here");
    expect(firstSentence("")).toBe("");
    const long = firstSentence(`${"word ".repeat(60)}end.`);
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith("…")).toBe(true);
  });

  it("reads the price and stock the way a customer will", () => {
    expect(priceSummary(form({ price: "1500" }))).toBe("Customers will see KES 1,500");
    expect(priceSummary(form({ price: "1500", salePrice: "1200" }))).toBe("Customers will see KES 1,200 (was KES 1,500), 20% off");
    expect(priceSummary(form({ price: "1500", trackStock: true, stockCount: "2", lowStockThreshold: "3" }))).toBe("Customers will see KES 1,500, Low stock");
    expect(priceSummary(form({ price: "1500", trackStock: true, stockCount: "2", lowStockThreshold: "3", showStockCount: true }))).toContain("Only 2 left");
    expect(priceSummary(form({ priceType: "range", price: "100", priceMax: "250" }))).toBe("Customers will see KES 100 to KES 250");
    expect(priceSummary(form({ priceType: "free" }))).toBe("Customers will see Free");
    expect(priceSummary(form({ priceType: "contact", availability: "out_of_stock" }))).toBe("Customers will see Contact for price, Out of stock, so customers cannot see it");
    expect(priceSummary(form())).toBe("Customers will see no price yet");
    expect(stockStatusOf(form({ trackStock: true, stockCount: "0" }))).toBe("out_of_stock");
  });

  it("scores quality, and a bare listing is still savable", () => {
    const bare = form({ name: "Plain", price: "10" });
    expect(validateItemForm(bare).ok).toBe(true);
    const checks = qualityChecks(bare, 0);
    expect(qualityScore(checks)).toBe(20);
    expect(checks.filter((c) => !c.done).map((c) => c.todo)).toEqual(expect.arrayContaining(["Add a photo", "Add a short description", "Add 1 highlight"]));
    const full = form({ name: "Full", price: "10", section: "A", shortDescription: "x", description: "y".repeat(80), highlights: [{ title: "", text: "t" }], specs: [{ group: "Features & Specs", label: "a", value: "b" }] });
    expect(qualityScore(qualityChecks(full, 1))).toBe(100);
  });

  it("finds the step and field of the first error, in screen order", () => {
    const bad = validateItemForm(form({ name: "", price: "", highlights: [{ title: "", text: "" }, { title: "x", text: "" }] }));
    expect(firstErrorTarget(bad.errors)).toMatchObject({ step: "basics", focus: "name" });
    const rows = validateItemForm(form({ name: "Ok", price: "5", specs: [{ group: "Features & Specs", label: "Color", value: "" }] }));
    expect(firstErrorTarget(rows.errors)).toMatchObject({ step: "details", focus: "spec-0-value" });
    expect(errorList(bad.errors).map((e) => e.focus)).toEqual(["name", "price", "hl-1-text"]);
  });

  it("gives an example for the shop's category, and a generic one otherwise", () => {
    expect(exampleShortFor("Barbershop")).toMatch(/fade/i);
    expect(exampleShortFor("Something else")).toBe(GENERIC_EXAMPLE);
  });
});

describe("sections", () => {
  it("shows what each section is for, and whether it is required", async () => {
    await openNew();
    const section = (name) => screen.getByRole("heading", { level: 2, name }).closest("section");
    expect(within(section("Basics")).getByText("Required")).toBeInTheDocument();
    expect(within(section("Price and stock")).getByText("Required")).toBeInTheDocument();
    expect(within(section("Media")).getByText("Optional")).toBeInTheDocument();
    expect(within(section("Details")).getByText("Optional")).toBeInTheDocument();
    expect(within(section("Basics")).getByText(/what customers read first/i)).toBeInTheDocument();
    expect(within(section("Media")).getByText(/Drag photos and videos here/)).toBeInTheDocument();
    expect(within(section("Details")).getByText("No highlights yet")).toBeInTheDocument();
  });

  it("names every icon button, so none is only a picture", async () => {
    const user = userEvent.setup();
    await openNew();
    await user.click(screen.getByRole("button", { name: "Add highlight" }));
    await user.click(screen.getByRole("button", { name: "Add highlight" }));
    for (const name of ["Move highlight 1 up", "Move highlight 1 down", "Remove highlight 1", "Move highlight 2 up"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /^Remove$/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove highlight 2" }));
    expect(screen.getByText("1 of 8")).toBeInTheDocument();
  });

  it("only asks for the price fields the price type needs", async () => {
    const user = userEvent.setup();
    await openNew();
    expect(screen.getByLabelText("Price (KES)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sale price (KES, optional)")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add a sale price" }));
    await user.type(screen.getByLabelText("Price (KES)"), "1500");
    await user.type(screen.getByLabelText("Sale price (KES, optional)"), "1200");
    expect(screen.getByTestId("price-summary")).toHaveTextContent("Customers will see KES 1,200 (was KES 1,500), 20% off");
    await user.selectOptions(screen.getByLabelText("Price type"), "range");
    expect(screen.getByLabelText("Lowest price (KES)")).toBeInTheDocument();
    expect(screen.getByLabelText("Highest price (KES)")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Price type"), "free");
    expect(screen.queryByLabelText(/price \(KES/i)).toBeNull();
    expect(screen.getByTestId("price-summary")).toHaveTextContent("Customers will see Free");
    await user.click(screen.getByLabelText("Count my stock"));
    await user.type(screen.getByLabelText("How many do you have now?"), "2");
    expect(screen.getByTestId("price-summary")).toHaveTextContent("Customers will see Free, Low stock");
  });

  it("uses a number keypad for money and counts", async () => {
    const user = userEvent.setup();
    await openNew();
    expect(screen.getByLabelText("Price (KES)")).toHaveAttribute("inputmode", "decimal");
    await user.click(screen.getByLabelText("Count my stock"));
    expect(screen.getByLabelText("How many do you have now?")).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText(/Tell customers it is low/)).toHaveAttribute("inputmode", "numeric");
  });
});

describe("short and long description", () => {
  it("counts both, and keeps paragraph breaks", async () => {
    const user = userEvent.setup();
    await openNew();
    await user.type(screen.getByLabelText("Short description (optional)"), "Soft sponge");
    expect(screen.getByText("11/140")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Description"), "First para{enter}Second para");
    expect(screen.getByLabelText("Description")).toHaveValue("First para\nSecond para");
    expect(screen.getByText("/2000", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText(/Customers (see|read) this/).length).toBeGreaterThanOrEqual(2);
  });

  it("suggests the first sentence when the short description is empty, and never fills it silently", async () => {
    const user = userEvent.setup();
    await openNew();
    expect(screen.queryByTestId("short-suggestion")).toBeNull();
    await user.type(screen.getByLabelText("Description"), "Fresh bread baked daily. Made with love.");
    const suggestion = await screen.findByTestId("short-suggestion");
    expect(suggestion).toHaveTextContent("Fresh bread baked daily.");
    expect(screen.getByLabelText("Short description (optional)")).toHaveValue("");
    await user.click(within(suggestion).getByRole("button", { name: "Use the first sentence of the description" }));
    expect(screen.getByLabelText("Short description (optional)")).toHaveValue("Fresh bread baked daily.");
    expect(screen.queryByTestId("short-suggestion")).toBeNull();
  });

  it("offers no suggestion when the short description already has text", async () => {
    const user = userEvent.setup();
    await openNew();
    await user.type(screen.getByLabelText("Short description (optional)"), "Mine");
    await user.type(screen.getByLabelText("Description"), "Something long. And more.");
    expect(screen.queryByTestId("short-suggestion")).toBeNull();
  });

  it("shows an example for the shop's kind of business", async () => {
    await openNew();
    expect(screen.getByLabelText("Short description (optional)")).toHaveAttribute("placeholder", expect.stringMatching(/fade/i));
  });
});

describe("phone stepper", () => {
  it("shows one step at a time with progress, and moves with Back and Next", async () => {
    const user = userEvent.setup();
    await openNew(375);
    expect(screen.getByText(/Step 1 of 5/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.queryByRole("heading", { level: 2, name: "Basics" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next: Basics" }));
    expect(screen.getByRole("heading", { level: 2, name: "Basics" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Media" })).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "2");
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Basics" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Step 4: Details" }));
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { level: 2, name: "Price and stock" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Step 5: Review" }));
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("jumps to the step with the first error and puts the cursor in the field", async () => {
    const user = userEvent.setup();
    await openNew(375);
    await user.click(screen.getByRole("button", { name: "Step 3: Price and stock" }));
    expect(screen.queryByLabelText("Name")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Basics" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Fix 2 things before saving/)).toBeInTheDocument();
  });

  it("saves from the last step", async () => {
    const user = userEvent.setup();
    await openNew(375);
    await user.click(screen.getByRole("button", { name: "Next: Basics" }));
    await user.type(screen.getByLabelText("Name"), "Phone made");
    await user.click(screen.getByRole("button", { name: "Next: Price" }));
    await user.type(screen.getByLabelText("Price (KES)"), "250");
    await user.click(screen.getByRole("button", { name: "Step 5: Review" }));
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Phone made", price: 250, draft: true }));
    expect(await screen.findByTestId("listing-grid")).toBeInTheDocument();
  });
});

describe("layout per width", () => {
  it("tablet: every section on one page, with section tabs and no preview", async () => {
    await openNew(900);
    for (const name of ["Media", "Basics", "Price and stock", "Details", "Review"]) expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Live preview" })).toBeNull();
    expect(screen.queryByRole("progressbar", { name: "Progress" })).toBeNull();
  });

  it("desktop: a section nav on the left and the live preview on the right", async () => {
    await openNew(1280);
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Live preview" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Checklist" })).toBeNull();
  });

  it("wide: the same plus a checklist and quality meter on the side", async () => {
    await openNew(1920);
    expect(screen.getByRole("region", { name: "Live preview" })).toBeInTheDocument();
    const side = screen.getByRole("complementary", { name: "Checklist" });
    expect(within(side).getByRole("progressbar", { name: "Listing quality" })).toBeInTheDocument();
  });
});

describe("live preview", () => {
  it("updates as the seller types, and switches between card and page", async () => {
    const user = userEvent.setup();
    await openNew(1280);
    const preview = screen.getByRole("region", { name: "Live preview" });
    await user.type(screen.getByLabelText("Name"), "Rye loaf");
    await user.type(screen.getByLabelText("Price (KES)"), "300");
    await user.type(screen.getByLabelText("Short description (optional)"), "Dense and dark");
    expect(within(preview).getByRole("region", { name: /Preview of Rye loaf, card view, mobile size/ })).toBeInTheDocument();
    expect(within(preview).getAllByText("Rye loaf").length).toBeGreaterThan(0);
    expect(within(preview).getByText("Dense and dark")).toBeInTheDocument();
    expect(preview).toHaveTextContent("KES 300");
    await user.click(within(preview).getByRole("button", { name: "Page" }));
    expect(within(preview).getByRole("button", { name: "Page" })).toHaveAttribute("aria-pressed", "true");
    expect(within(preview).getByRole("region", { name: /page view/ })).toBeInTheDocument();
    await user.click(within(preview).getByRole("button", { name: "Desktop" }));
    expect(within(preview).getByRole("region", { name: /desktop size/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add highlight" }));
    await user.type(screen.getByLabelText("Highlight 1 text"), "Baked at dawn");
    expect(within(preview).getByText("Baked at dawn")).toBeInTheDocument();
  });

  it("lights up the part of the preview that matches the focused field", async () => {
    const user = userEvent.setup();
    await openNew(1280);
    const preview = screen.getByRole("region", { name: "Live preview" });
    expect(preview.querySelector("[data-hl]")).toBeNull();
    await user.click(screen.getByLabelText("Short description (optional)"));
    expect(preview.querySelector("[data-hl]")).not.toBeNull();
    expect(preview.querySelector("[data-hl]")).toHaveTextContent(/short description shows here/i);
    await user.click(screen.getByLabelText("Name"));
    expect(preview.querySelector("[data-hl]")).toHaveTextContent(/Item name/);
  });

  it("cannot be tapped or tabbed into", async () => {
    await openNew(1280);
    const frame = screen.getByRole("region", { name: "Live preview" }).querySelector("[inert]");
    expect(frame).not.toBeNull();
  });
});

describe("review and quality", () => {
  it("lists what is missing as links that take you to the field", async () => {
    const user = userEvent.setup();
    await openNew(900);
    const quality = screen.getByTestId("quality");
    expect(within(quality).getByTestId("quality-score")).toHaveTextContent("0%");
    await user.click(within(quality).getByRole("button", { name: "Add a short description" }));
    await waitFor(() => expect(screen.getByLabelText("Short description (optional)")).toHaveFocus());
    await user.click(within(quality).getByRole("button", { name: "Add 1 highlight" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add highlight" })).toHaveFocus());
    await user.type(screen.getByLabelText("Short description (optional)"), "Done");
    expect(within(screen.getByTestId("quality")).queryByRole("button", { name: "Add a short description" })).toBeNull();
  });

  it("opens the right step from a suggestion on a phone", async () => {
    const user = userEvent.setup();
    await openNew(375);
    await user.click(screen.getByRole("button", { name: "Step 5: Review" }));
    await user.click(screen.getByRole("button", { name: "Add a short description" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Basics" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Short description (optional)")).toHaveFocus());
  });

  it("is advice only: a bare item still saves, and only real errors block", async () => {
    const user = userEvent.setup();
    await openNew(900);
    const quality = screen.getByTestId("quality");
    expect(within(quality).getByText(/You can save without them/)).toBeInTheDocument();
    expect(screen.getByTestId("review-problems")).toHaveTextContent("Name");
    await user.click(headerButton("Add item"));
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
    expect(M.state.items.some((i) => i.name === "Bare")).toBe(false);
    await user.type(screen.getByLabelText("Name"), "Bare");
    await user.type(screen.getByLabelText("Price (KES)"), "10");
    expect(screen.queryByTestId("review-problems")).toBeNull();
    await user.click(headerButton("Add item"));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Bare", price: 10 }));
  });
});

describe("unsaved changes", () => {
  it("asks before leaving by any route, and lets the seller keep editing", async () => {
    const user = userEvent.setup();
    const { router } = await openNew();
    await user.type(screen.getByLabelText("Name"), "Half done");
    await act(async () => { router.navigate("/business/notifications"); });
    const ask = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/business/catalog/new");
    expect(screen.getByLabelText("Name")).toHaveValue("Half done");
    await act(async () => { router.navigate("/business/notifications"); });
    await user.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" })).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/business/notifications"));
    expect(localStorage.getItem(draftKey)).toBeNull();
  });

  it("does not ask when nothing changed", async () => {
    const user = userEvent.setup();
    const { router } = await openNew();
    await user.click(screen.getByRole("button", { name: "Back to your listings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/business/catalog"));
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).toBeNull();
  });

  it("warns before the tab is closed, only while there are changes", async () => {
    const user = userEvent.setup();
    await openNew();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await user.type(screen.getByLabelText("Name"), "Typing");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("does not ask after a successful save", async () => {
    const user = userEvent.setup();
    const { router } = await openNew();
    await user.type(screen.getByLabelText("Name"), "Saved one");
    await user.type(screen.getByLabelText("Price (KES)"), "50");
    await user.click(headerButton("Add item"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/business/catalog"));
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).toBeNull();
    expect(await screen.findByText("Item added as a draft.")).toBeInTheDocument();
  });
});

describe("draft autosave", () => {
  it("keeps the form on this device and brings it back, and Start over clears it", async () => {
    const user = userEvent.setup();
    const first = await openNew();
    await user.type(screen.getByLabelText("Name"), "Rye loaf");
    await user.type(screen.getByLabelText("Brand (optional)"), "Dawn");
    await waitFor(() => expect(localStorage.getItem(draftKey)).toContain("Rye loaf"), { timeout: 3000 });
    expect(localStorage.getItem(draftKey)).not.toMatch(/blob:|File/);
    first.unmount();
    await openNew();
    expect(screen.getByLabelText("Name")).toHaveValue("Rye loaf");
    expect(screen.getByLabelText("Brand (optional)")).toHaveValue("Dawn");
    expect(screen.getByText(/brought back your unsaved changes/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(localStorage.getItem(draftKey)).toBeNull();
  });

  it("forgets the draft once the item is saved", async () => {
    const user = userEvent.setup();
    await openNew();
    await user.type(screen.getByLabelText("Name"), "Gone soon");
    await user.type(screen.getByLabelText("Price (KES)"), "5");
    await waitFor(() => expect(localStorage.getItem(draftKey)).not.toBeNull(), { timeout: 3000 });
    await user.click(headerButton("Add item"));
    await waitFor(() => expect(M.state.items.at(-1).name).toBe("Gone soon"));
    await screen.findByTestId("listing-grid");
    expect(localStorage.getItem(draftKey)).toBeNull();
  });
});

describe("editing an item", () => {
  it("opens a saved item on its own page, and Save and stay keeps the seller there", async () => {
    const user = userEvent.setup();
    viewport(1000);
    const { router } = await signedInApp("/business/catalog");
    const item = M.state.items.find((i) => i.visible && !i.draft && !i.removedByAdmin && i.priceType === "fixed");
    await act(async () => { router.navigate(`/business/catalog/${item.id}/edit`); });
    expect(await screen.findByRole("heading", { level: 1, name: "Edit item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue(item.name);
    expect(screen.getByRole("button", { name: "Save and stay" })).toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), " II");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save and stay" }));
    await waitFor(() => expect(M.state.items.find((i) => i.id === item.id).name).toMatch(/ II$/));
    expect(await screen.findByText("Item saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    expect(router.state.location.pathname).toBe(`/business/catalog/${item.id}/edit`);
  });

  it("says so when the item does not exist", async () => {
    viewport(1000);
    await signedInApp("/business/catalog/nope/edit");
    expect(await screen.findByRole("heading", { name: "We could not find that item" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your listings" })).toHaveAttribute("href", "/business/catalog");
  });

  it("a new item can be saved as a draft and carried on editing", async () => {
    const user = userEvent.setup();
    const { router } = await openNew();
    await user.type(screen.getByLabelText("Name"), "Keep going");
    await user.type(screen.getByLabelText("Price (KES)"), "70");
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/business\/catalog\/.+\/edit$/));
    expect(await screen.findByRole("heading", { level: 1, name: "Edit item" })).toBeInTheDocument();
    expect(M.state.items.at(-1)).toMatchObject({ name: "Keep going", draft: true, visible: false });
    expect(screen.getByLabelText("Name")).toHaveValue("Keep going");
    expect(await screen.findByText("Item added as a draft.")).toBeInTheDocument();
  });
});

describe("the shop logo on the item page", () => {
  it("is shown on Add item and on Edit item, at phone, tablet and desktop widths", async () => {
    for (const width of [360, 700, 1000]) {
      const { unmount } = await openNew(width);
      const brand = screen.getByTestId("editor-brand");
      expect(brand).toHaveTextContent("Demo Shop");
      expect(brand).toHaveTextContent("EpicMKT Seller");
      expect(brand).toHaveAttribute("href", "/business/catalog");
      unmount();
    }
    viewport(1000);
    const { router } = await signedInApp("/business/catalog");
    const item = M.state.items.find((i) => i.visible && !i.draft && !i.removedByAdmin);
    await act(async () => { router.navigate(`/business/catalog/${item.id}/edit`); });
    expect(await screen.findByTestId("editor-brand")).toHaveTextContent("Demo Shop");
  });

  it("opens My listings when there is nothing unsaved", async () => {
    const user = userEvent.setup();
    const { router } = await openNew();
    await user.click(screen.getByTestId("editor-brand"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/business/catalog"));
  });

  it("asks before leaving when there are unsaved changes, and keeps the seller on the item page if they keep editing", async () => {
    const user = userEvent.setup();
    const { router } = await openNew();
    await user.type(screen.getByLabelText("Name"), "Sourdough");
    await user.click(screen.getByTestId("editor-brand"));
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/business/catalog/new");
    expect(screen.getByLabelText("Name")).toHaveValue("Sourdough");
  });

  it("keeps the Add item button in the header as it was", async () => {
    await openNew();
    expect(headerButton("Add item")).toBeInTheDocument();
    expect(headerButton("Save as draft")).toBeInTheDocument();
  });
});
