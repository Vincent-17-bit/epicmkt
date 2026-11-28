import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { configureAxe } from "vitest-axe";
import { phone } from "@epicmkt/shared/options/fixtures";

const mocks = vi.hoisted(() => ({ getSaved: vi.fn(), logEvent: vi.fn(), logContactEvent: vi.fn() }));
vi.mock("../../api/index.js", () => ({ items: { getSaved: mocks.getSaved }, logEvent: mocks.logEvent, logContactEvent: mocks.logContactEvent }));

const { default: SavedDrawer } = await import("./SavedDrawer.jsx");
const { savedList } = await import("../../lib/savedList.js");
const { useToastStore } = await import("../../stores/toast.js");

const axe = configureAxe({ rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });

const sub = (v) => (_, el) => el?.tagName === "P" && el.textContent === `Subtotal ${v}`;
const shopA = { id: "bA", slug: "nyumbani", name: "Nyumbani Home Store", whatsapp: "0712345678", phone: "0712345678", isOpen: true, statusLine: "Open", verified: true, lat: -0.1, lng: 34.7, categoryId: "general" };
const shopB = { id: "bB", slug: "glow", name: "Glow Salon", whatsapp: "0722000111", phone: "0722000111", isOpen: false, statusLine: "Closed, opens 7am", categoryId: "salon" };
const pricing = (n) => ({ regularPrice: n, salePrice: n, savings: 0, discountPercent: 0, unit: null, variants: [] });
const product = (id, name, price, shop = shopA, over = {}) => ({ id, name, kind: "product", availability: "available", businessSlug: shop.slug, business: shop, pricing: pricing(price), ...over });
const entry = (id, shop, over = {}) => ({ itemId: id, businessId: shop.id, businessSlug: shop.slug, kind: "product", qty: 1, snap: { name: id, unit: 100, businessName: shop.name }, ...over });
const answer = (list) => ({ items: Object.fromEntries(list.map((i) => [i.id, i])), redirects: {}, shops: { bA: shopA, bB: shopB }, now: Date.now(), fetchedAt: Date.now() });

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}|${l.state?.saved ? "saved" : "closed"}`}</p>;
}
const mount = (entries = [{ pathname: "/", state: { saved: true } }], index = entries.length - 1) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <button data-testid="opener">open</button>
        <SavedDrawer />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );
};
const seed = (list) => {
  const l = savedList();
  l.clear();
  [...list].reverse().forEach((e) => l.add(e));
};

beforeEach(() => {
  savedList().clear();
  mocks.getSaved.mockReset();
  mocks.logEvent.mockReset();
  mocks.logContactEvent.mockReset();
  document.body.style.overflow = "";
  document.documentElement.removeAttribute("data-theme");
  useToastStore.setState({ toasts: [] });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("SavedDrawer", () => {
  it("is a modal dialog labelled by its heading, and the empty state invites browsing", async () => {
    mount();
    const dialog = screen.getByRole("dialog", { name: "Saved" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("id", "saved-drawer");
    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
    expect(screen.getByText("Tap the heart on any product or service to keep it here.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Browse products" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/|");
    expect(mocks.getSaved).not.toHaveBeenCalled();
  });

  it("groups lines by shop, the newest activity first, with subtotals and an estimated total", async () => {
    let t = 1000;
    const l = savedList();
    l.add({ ...entry("table", shopA), snap: { name: "Table", unit: 8500 }, savedAt: t++ });
    l.add({ ...entry("braids", shopB, { kind: "service" }), snap: { name: "Braids", unit: 3000 } });
    mocks.getSaved.mockResolvedValue(answer([product("table", "Wooden coffee table", 8500), product("braids", "Box braids", 3000, shopB, { kind: "service" })]));
    mount();
    await screen.findByText("Wooden coffee table"); // today's name: the data has arrived (the snapshot only had "table")
    const shops = screen.getAllByTestId("saved-shop");
    expect(shops).toHaveLength(2);
    expect(shops.map((s) => within(s).getByRole("heading", { level: 3 }).textContent.replace("Verified", ""))).toEqual(["Glow Salon", "Nyumbani Home Store"]); // the shop saved last is on top
    expect(within(shops[1]).getByText(sub("KES 8,500"))).toBeInTheDocument();
    expect(within(shops[0]).getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("2 items · 2 shops")).toBeInTheDocument();
    expect(screen.getByTestId("saved-total")).toHaveTextContent("Estimated total KES 11,500");
    expect(screen.getByText("Each shop confirms final prices.")).toBeInTheDocument();
    expect(mocks.getSaved).toHaveBeenCalledWith(["braids", "table"]);
  });

  it("shows the first four lines of a shop, then Show more", async () => {
    seed(Array.from({ length: 6 }, (_, i) => entry(`p${i}`, shopA)));
    mocks.getSaved.mockResolvedValue(answer(Array.from({ length: 6 }, (_, i) => product(`p${i}`, `Product ${i}`, 100))));
    mount();
    await screen.findByText(sub("KES 600"));
    expect(screen.getAllByTestId("saved-line")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getAllByTestId("saved-line")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });

  it("lines that cannot be totalled are shown and left out, and the footer says how many", async () => {
    seed([entry("a", shopA), entry("b", shopA), entry("c", shopA), entry("gone", shopA)]);
    mocks.getSaved.mockResolvedValue({ ...answer([product("a", "Lamp", 900), product("b", "Rug", 0, shopA, { pricing: null }), product("c", "Sofa", 1, shopA, { pricing: pricing(24000), options: phone().options, optionVariants: phone().optionVariants })]), items: { a: product("a", "Lamp", 900), b: product("b", "Rug", 0, shopA, { pricing: null }), c: product("c", "Sofa", 1, shopA, { options: phone().options, optionVariants: phone().optionVariants, pricing: { ...pricing(24000), priceMin: 24000 } }), gone: null }, shops: { bA: shopA } });
    mount();
    await screen.findByText("Lamp");
    expect(screen.getByText("Ask for the price")).toBeInTheDocument();
    expect(screen.getAllByText(/From KES 24,000 · Choose options/).length).toBeGreaterThan(0);
    expect(screen.getByText("No longer available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find similar" }).getAttribute("href")).toBe("/products?q=gone");
    expect(screen.getByTestId("saved-total")).toHaveTextContent("Estimated total KES 900 · 2 items without a price");
  });

  it("changing a quantity in the drawer updates the stored line and the line total", async () => {
    seed([entry("a", shopA, { qty: 1 })]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900)]));
    mount();
    await screen.findByText(sub("KES 900"));
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(savedList().list()[0].qty).toBe(2);
    expect(screen.getAllByText("KES 1,800").length).toBeGreaterThan(0);
  });

  it("each line has a delete button, and so does each shop; both undo", async () => {
    seed([entry("a", shopA), entry("b", shopA), entry("c", shopB)]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900), product("b", "Rug", 500), product("c", "Braids", 3000, shopB)]));
    mount();
    await screen.findByText("Lamp");
    const shopButton = screen.getByRole("button", { name: `Remove ${shopA.name} and its items` });
    await userEvent.click(shopButton);
    expect(savedList().list().map((e) => e.itemId)).toEqual(["c"]);
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast.detail).toBe(shopA.name);
    act(() => toast.action.onClick());
    expect(savedList().list().map((e) => e.itemId).sort()).toEqual(["a", "b", "c"]);
    expect(screen.getAllByRole("button", { name: /^Remove .* from Saved$/ })).toHaveLength(3);
  });

  it("removes a line with Undo, in place, and never loses it any other way", async () => {
    seed([entry("a", shopA), entry("b", shopA)]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900), product("b", "Rug", 500)]));
    mount();
    await screen.findByText("Lamp");
    await userEvent.click(screen.getByRole("button", { name: "Remove Lamp from Saved" }));
    expect(savedList().count()).toBe(1);
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast.message).toBe("Removed from wishlist");
    expect(toast.action.label).toBe("Undo");
    act(() => toast.action.onClick());
    expect(savedList().list().map((e) => e.itemId)).toEqual(["a", "b"]);
  });

  it("Remove all asks inside the app first, then can be undone", async () => {
    seed([entry("a", shopA), entry("b", shopA)]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900), product("b", "Rug", 500)]));
    mount();
    await screen.findByText("Lamp");
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove all" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(savedList().count()).toBe(2);
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove all" }));
    expect(savedList().count()).toBe(0);
    act(() => useToastStore.getState().toasts.at(-1).action.onClick());
    expect(savedList().count()).toBe(2);
  });

  it("opening an item replaces the drawer's entry and carries the chosen option", async () => {
    seed([entry("a", shopA)]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900)]));
    mount();
    await userEvent.click(await screen.findByRole("link", { name: "Lamp" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/b/nyumbani/i/a|closed");
  });

  it("the shop name goes to the shop the same way", async () => {
    seed([entry("a", shopA)]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900)]));
    mount();
    await userEvent.click(await screen.findByRole("link", { name: "Nyumbani Home Store" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/b/nyumbani|closed");
  });

  it("closes with Escape, the close button and the backdrop (going back)", async () => {
    const entries = [{ pathname: "/" }, { pathname: "/", state: { saved: true } }];
    const { unmount } = mount(entries);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("|closed"));
    unmount();
    mount(entries);
    await userEvent.click(screen.getByRole("button", { name: "Close Saved list" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("|closed"));
    document.body.innerHTML = "";
    mount(entries);
    await userEvent.click(screen.getByTestId("saved-backdrop"));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("|closed"));
  });

  it("on /saved, closing goes home with replace", async () => {
    mount([{ pathname: "/saved" }]);
    await userEvent.click(screen.getByRole("button", { name: "Close Saved list" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/|");
  });

  it("a swipe to the right closes it; a mouse never does; a swipe on the stepper is ignored", async () => {
    seed([entry("a", shopA)]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900)]));
    const entries = [{ pathname: "/" }, { pathname: "/", state: { saved: true } }];
    mount(entries);
    await screen.findByText("Lamp");
    const panel = screen.getByRole("dialog");
    Object.defineProperty(panel, "offsetWidth", { value: 400, configurable: true });
    // The hook times a flick with performance.now(), so the test sets the clock: down at 0, up after `t` ms.
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const drag = (target, type, to, t) => {
      clock = 0;
      fireEvent.pointerDown(target, { pointerId: 1, pointerType: type, clientX: 0, clientY: 100 });
      fireEvent.pointerMove(target, { pointerId: 1, pointerType: type, clientX: to / 2, clientY: 102 });
      fireEvent.pointerMove(target, { pointerId: 1, pointerType: type, clientX: to, clientY: 104 });
      clock = t;
      fireEvent.pointerUp(target, { pointerId: 1, pointerType: type, clientX: to, clientY: 104 });
    };
    drag(panel, "mouse", 300, 100);
    expect(screen.getByTestId("where")).toHaveTextContent("|saved");
    drag(screen.getByRole("textbox"), "touch", 300, 100);
    expect(screen.getByTestId("where")).toHaveTextContent("|saved");
    drag(panel, "touch", 30, 2000); // short and slow: springs back
    expect(screen.getByTestId("where")).toHaveTextContent("|saved");
    drag(panel, "touch", 200, 400); // past 30% of the width
    performance.now.mockRestore();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("|closed"));
  });

  it("locks the page scroll and puts back exactly what was there (the item sheet may hold it)", () => {
    document.body.style.overflow = "hidden";
    const first = mount();
    first.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    document.body.style.overflow = "";
    const again = mount();
    expect(document.body.style.overflow).toBe("hidden");
    again.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus to the heading, and back to what opened it", async () => {
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: "/", state: { saved: true } }]}>
          <button data-testid="opener">open</button>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const opener = screen.getByTestId("opener");
    opener.focus();
    view.unmount();
    opener.focus();
    const drawer = mount();
    expect(screen.getByRole("heading", { name: "Saved", level: 2 })).toHaveFocus();
    drawer.unmount();
  });

  it("says so when offline and draws from the snapshots", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    seed([entry("a", shopA, { qty: 2, snap: { name: "Lamp", unit: 900, businessName: "Nyumbani Home Store" } })]);
    mocks.getSaved.mockImplementation(() => new Promise(() => {}));
    mount();
    expect(screen.getByText("Offline. Showing prices from when you saved.")).toBeInTheDocument();
    expect(await screen.findByText("Lamp")).toBeInTheDocument();
    expect(screen.getByTestId("saved-total")).toHaveTextContent("Estimated total KES 1,800 · may have changed");
  });

  it("sends one WhatsApp message per shop, notes when, and removes nothing", async () => {
    seed([entry("a", shopA, { qty: 2 }), entry("b", shopB, { kind: "service" })]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Lamp", 900), product("b", "Braids", 3000, shopB, { kind: "service" })]));
    mount();
    const sends = await screen.findAllByTestId("saved-send");
    expect(sends).toHaveLength(2);
    const links = sends.map((a) => a.getAttribute("href"));
    const mine = links.find((h) => h.includes("254712345678"));
    expect(decodeURIComponent(mine)).toContain("Hi Nyumbani Home Store, I found these on EpicMKT:\n1. *Lamp* x2 · KES 1,800");
    const glow = links.find((h) => h.includes("254722000111"));
    expect(decodeURIComponent(glow)).toContain("I'd like to book on EpicMKT:");
    sends[0].addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(sends[0]);
    expect(mocks.logEvent).toHaveBeenCalledWith("saved_send", expect.objectContaining({ lines: 1 }));
    expect(mocks.logContactEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "whatsapp" }));
    expect(savedList().count()).toBe(2);
    expect(screen.getAllByText(/Sent \d/)).toHaveLength(1);
    expect(screen.getByText(/Closed now\. They'll reply when open\./)).toBeInTheDocument();
  });

  it("a shop that is no longer live keeps its lines and says so", async () => {
    seed([entry("a", shopA)]);
    mocks.getSaved.mockResolvedValue({ items: { a: null }, redirects: {}, shops: {}, now: 1, fetchedAt: 1 });
    mount();
    expect(await screen.findByText("This shop isn't on EpicMKT right now")).toBeInTheDocument();
    expect(savedList().count()).toBe(1);
  });

  it("a merged item quietly points at the new one, keeping the quantity", async () => {
    seed([entry("old", shopA, { qty: 3 })]);
    mocks.getSaved.mockResolvedValue({ ...answer([product("new", "Lamp (new)", 900)]), items: { new: product("new", "Lamp (new)", 900) }, redirects: { old: { itemId: "new", param: "" } } });
    mount();
    expect(await screen.findByText(sub("KES 2,700"))).toBeInTheDocument();
    expect(savedList().list()[0].itemId).toBe("old");
  });

  it("price chips: cheaper, dearer and flash", async () => {
    seed([entry("a", shopA, { snap: { name: "A", unit: 1000 } }), entry("b", shopA, { snap: { name: "B", unit: 500 } }), entry("c", shopA, { snap: { name: "C", unit: 1000 } })]);
    mocks.getSaved.mockResolvedValue(answer([product("a", "Alpha", 800), product("b", "Beta", 800), product("c", "Gamma", 800, shopA, { flash: { sale: { id: "s", endsAt: "2999-01-01T00:00:00Z" } } })]));
    mount();
    expect(await screen.findByText("Price down KES 200")).toBeInTheDocument();
    expect(screen.getByText("Price up KES 300")).toBeInTheDocument();
    expect(screen.getByText("Flash sale")).toBeInTheDocument();
  });

  it.each(["light", "dark"])("has no accessibility violations in %s: empty, full and with an unavailable line", async (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    const empty = mount();
    expect((await axe(empty.container)).violations).toEqual([]);
    empty.unmount();
    seed([entry("a", shopA), entry("gone", shopA), entry("b", shopB, { kind: "service" })]);
    mocks.getSaved.mockResolvedValue({ ...answer([product("a", "Lamp", 900), product("b", "Braids", 3000, shopB, { kind: "service" })]), items: { a: product("a", "Lamp", 900), b: product("b", "Braids", 3000, shopB, { kind: "service" }), gone: null } });
    const full = mount();
    await screen.findByText("Lamp");
    expect((await axe(full.container)).violations).toEqual([]);
  });
});
