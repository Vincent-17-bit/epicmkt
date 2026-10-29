import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemDetail from "./ItemDetail.jsx";

const pricing = (regular, sale) => ({
  regularPrice: regular,
  salePrice: sale,
  savings: regular - sale,
  discountPercent: Math.round(((regular - sale) / regular) * 100),
  unit: null,
  variants: []
});

const base = {
  id: "fade",
  name: "Fade and beard",
  description: "Sharp.",
  images: [{ id: "i1", url: "a.png", caption: "x" }],
  shortDescription: "Sharp.",
  kind: "service",
  offers: [],
  flash: null,
  specs: [{ label: "Duration", value: "45 minutes" }],
  availability: "available",
  section: "Cuts",
  business: { slug: "fade-kings", name: "Fade Kings", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true }
};

const selective = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Other ${i}`, imageUrl: "b.png", availability: "available", pricing: pricing(100, 100) }));

const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn() }));
const logEvent = vi.hoisted(() => vi.fn());
vi.mock("../api/index.js", () => ({ logContactEvent: vi.fn(), logEvent, items: mocks }));

const mount = (props = {}, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ItemDetail business={{ id: "b_001", slug: "fade-kings", name: "Fade Kings" }} itemId="fade" onClose={() => {}} onSelect={() => {}} onReport={() => {}} {...props} />
      </QueryClientProvider>
    </MemoryRouter>
  );

const chatHrefs = () => screen.getAllByRole("link", { name: /Chat Seller/ }).map((a) => decodeURIComponent(a.getAttribute("href")));

describe("ItemDetail", () => {
  it("builds the regular chat message and links Visit Store", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(chatHrefs()[0]).toBe("https://wa.me/254712555101?text=Hi, I saw Fade and beard (KES 300) on EpicMKT");
    expect(screen.getAllByRole("link", { name: /Visit Store/ })[0]).toHaveAttribute("href", "/b/fade-kings");
  });

  it("shows the store's product count by its name, and nothing without one", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    const first = mount({ business: { id: "b_001", slug: "fade-kings", name: "Fade Kings", productCount: 195 } });
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(screen.getByText("195 products")).toBeInTheDocument();
    first.unmount();
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(screen.queryByText(/products?$/)).toBeNull();
  });

  it("puts photos and videos in one gallery in the seller's order, with no separate videos section", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({
      ...base,
      pricing: pricing(300, 300),
      media: [
        { id: "i1", kind: "image", url: "https://x.test/1.jpg", caption: "Fade" },
        { id: "v1", kind: "video", url: "a.mp4" },
        { id: "i2", kind: "image", url: "https://x.test/2.jpg", caption: "Beard" }
      ]
    });
    const { container, unmount } = mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"))).toEqual(["Photo 1 of 3", "Video 2 of 3", "Photo 3 of 3"]);
    expect(screen.queryByRole("button", { name: /Watch video/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Videos" })).toBeNull();
    container.querySelectorAll("video").forEach((v) => {
      expect(v.hasAttribute("autoplay")).toBe(false);
      expect(v.muted).toBe(true);
    });
    unmount();
    // The older payload (images[] + videos[]) still works.
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300), images: [{ id: "i1", url: "https://x.test/1.jpg" }], videos: [{ id: "v1", url: "a.mp4" }] });
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"))).toEqual(["Photo 1 of 2", "Video 2 of 2"]);
  });

  it("shows information in order: brand, name, short description, price, pack size, highlights, description", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({
      ...base,
      brand: "Wahl",
      shortDescription: "Quiet cordless clipper",
      description: "Quiet cordless clipper\n\nRuns for ninety minutes.\nCharges in two hours.",
      packSize: "1 unit",
      highlights: [{ text: "Point one" }],
      pricing: pricing(300, 300)
    });
    const { container } = mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    const title = container.querySelector("#item-title");
    const text = container.textContent;
    // The name also sits in the breadcrumb above; look it up from the page title itself.
    const at = (needle) => (needle === "Fade and beard" ? text.indexOf(needle, text.indexOf("Wahl")) : text.indexOf(needle));
    expect(title).toHaveTextContent("Fade and beard");
    const order = ["Wahl", "Fade and beard", "Quiet cordless clipper", "KES 300", "Pack size", "Point one", "Runs for ninety minutes."].map(at);
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The short description appears once: it is not repeated at the top of the full description.
    expect(text.split("Quiet cordless clipper").length - 1).toBe(1);
  });

  it("keeps paragraph breaks in the description and offers Read more / Read less only when it overflows", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({ ...base, shortDescription: "", description: "First paragraph.\n\nSecond paragraph.", pricing: pricing(300, 300) });
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const { container, unmount } = mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    const section = container.querySelector("[data-description]");
    expect(section.querySelectorAll("p")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
    unmount();

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 100 });
    try {
      mount();
      await screen.findByRole("heading", { name: "Fade and beard" });
      const more = await screen.findByRole("button", { name: "Read more" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      await userEvent.setup().click(more);
      expect(screen.getByRole("button", { name: "Read less" })).toHaveAttribute("aria-expanded", "true");
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollHeight", original);
      else delete HTMLElement.prototype.scrollHeight;
      delete HTMLElement.prototype.clientHeight;
    }
  });

  it("uses the flash sale wording and shows both prices", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 240) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(chatHrefs()[0]).toBe("https://wa.me/254712555101?text=Hi, I saw the flash sale on Fade and beard: KES 240 (was KES 300) on EpicMKT");
    expect(screen.getByText("KES 240")).toBeInTheDocument();
  });

  it("includes the chosen variant in the message", async () => {
    const variants = [
      { id: "s", label: "Small", regularPrice: 3500, salePrice: 3500, savings: 0, discountPercent: 0 },
      { id: "m", label: "Medium", regularPrice: 2500, salePrice: 2500, savings: 0, discountPercent: 0 }
    ];
    mocks.getDetail.mockResolvedValue({ ...base, pricing: { ...pricing(2500, 2500), variants } });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("radio", { name: "Medium", checked: true });
    await userEvent.setup().click(screen.getByRole("radio", { name: "Small" }));
    expect(chatHrefs()[0]).toContain("Fade and beard (Small) (KES 3,500)");
  });

  it("hides Store Selective with fewer than 2 other items", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue(selective(1));
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    await waitFor(() => expect(mocks.getStoreSelective).toHaveBeenCalled());
    expect(screen.queryByText("Store Selective")).not.toBeInTheDocument();
  });

  it("shows Store Selective and swaps item on select", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue(selective(3));
    const onSelect = vi.fn();
    mount({ onSelect });
    await screen.findByText("Store Selective");
    expect(await screen.findByRole("link", { name: /See all in store/ })).toHaveAttribute("href", "/b/fade-kings");
    await userEvent.setup().click(await screen.findByRole("button", { name: /Other 1/ }));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("closes on Escape", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    const onClose = vi.fn();
    mount({ onClose });
    await screen.findByRole("heading", { name: "Fade and beard" });
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows skeletons while loading", () => {
    mocks.getDetail.mockReturnValue(new Promise(() => {}));
    mocks.getStoreSelective.mockReturnValue(new Promise(() => {}));
    const { container } = mount();
    expect(container.ownerDocument.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Fade and beard" })).not.toBeInTheDocument();
  });

  it("shows a friendly error and recovers on retry", async () => {
    mocks.getDetail.mockRejectedValueOnce(new Error("offline"));
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load this item");
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    await userEvent.setup().click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("heading", { name: "Fade and beard" })).toBeInTheDocument();
  });

  it("replaces content with the unavailable state and a Store Selective row", async () => {
    const gone = Object.assign(new Error("nf"), { name: "NotFoundError" });
    mocks.getDetail.mockRejectedValue(gone);
    mocks.getStoreSelective.mockResolvedValue(selective(3));
    mount();
    expect(await screen.findByRole("heading", { name: "This item is no longer available" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visit Store/ })).toHaveAttribute("href", "/b/fade-kings");
    expect(await screen.findByText("Store Selective")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chat Seller/ })).not.toBeInTheDocument();
  });

  it("switches to the unavailable state when the item disappears while open", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount({}, client);
    await screen.findByRole("heading", { name: "Fade and beard" });
    mocks.getDetail.mockRejectedValue(Object.assign(new Error("nf"), { name: "NotFoundError" }));
    await client.invalidateQueries({ queryKey: ["item"] });
    expect(await screen.findByRole("heading", { name: "This item is no longer available" })).toBeInTheDocument();
  });

  it("shows plain-text Item unavailable and refetches the business only when it vanishes mid-view", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, "invalidateQueries");
    mount({}, client);
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ["business", "fade-kings"] });
    mocks.getDetail.mockRejectedValue(Object.assign(new Error("nf"), { name: "NotFoundError" }));
    await client.invalidateQueries({ queryKey: ["item"] });
    const crumb = await screen.findByText("Item unavailable");
    expect(crumb.closest("a,button")).toBeNull();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["business", "fade-kings"] });
  });

  it("does not refetch the business or relabel the crumb on a cold unavailable load", async () => {
    mocks.getDetail.mockRejectedValue(Object.assign(new Error("nf"), { name: "NotFoundError" }));
    mocks.getStoreSelective.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, "invalidateQueries");
    mount({}, client);
    await screen.findByRole("heading", { name: "This item is no longer available" });
    expect(screen.queryByText("Item unavailable")).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("renders the flash banner, two offers with See all, and JSON-LD", async () => {
    const view = (id) => ({ offer: { id, title: `Offer ${id}`, kind: "percent_off", value: 10, conditions: {} }, remainingMs: 86400000, appliesToLabel: "Whole store" });
    mocks.getDetail.mockResolvedValue({
      ...base,
      pricing: pricing(300, 240),
      flash: { sale: { id: "f", headline: "Weekend deal", quantityNote: "While stock lasts", endsAt: "2026-10-04T10:00:00.000Z" }, remainingMs: 3661000 },
      offers: [view("a"), view("b"), view("c")]
    });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    expect(await screen.findByText("Weekend deal")).toBeInTheDocument();
    expect(screen.getByText("While stock lasts")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await userEvent.setup().click(screen.getByRole("button", { name: "See all 3" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    const ld = JSON.parse(document.getElementById("item-jsonld").textContent);
    expect(ld["@type"]).toBe("Service");
    expect(ld.offers.priceValidUntil).toBe("2026-10-04T10:00:00.000Z");
    expect(ld.offers.price).toBe(240);
  });

  it("logs analytics events", async () => {
    logEvent.mockClear();
    mocks.getDetail.mockResolvedValue({ ...base, description: "Full", terms: "No refunds", pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue(selective(3));
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    const user = userEvent.setup();
    expect(logEvent).toHaveBeenCalledWith("item_view", expect.objectContaining({ itemId: "fade" }));
    await user.click(screen.getAllByRole("link", { name: /Chat Seller/ })[0]);
    expect(logEvent).toHaveBeenCalledWith("chat_seller_click", expect.objectContaining({ placement: "card" }));
    await user.click(screen.getAllByRole("link", { name: /Visit Store/ })[0]);
    expect(logEvent).toHaveBeenCalledWith("visit_store_click", expect.objectContaining({ placement: "card" }));
    await user.click(await screen.findByRole("button", { name: /Other 0/ }));
    expect(logEvent).toHaveBeenCalledWith("store_selective_click", expect.objectContaining({ targetItemId: "s0", position: 1 }));
    await user.click(screen.getByRole("button", { name: "Terms and notes" }));
    expect(logEvent).toHaveBeenCalledWith("spec_expand", expect.objectContaining({ panel: "terms" }));
  });
});

describe("ItemDetail details", () => {
  const hl = (n) => Array.from({ length: n }, (_, i) => ({ title: i === 0 ? "Lead" : undefined, text: `Point ${i + 1}` }));

  it("renders brand and highlights, five at first with Show all, in order before the panels", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, brand: "Thermos", highlights: hl(7), pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(screen.getByText("Thermos")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About this item" })).toBeInTheDocument();
    expect(screen.getByText("Lead").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem").filter((li) => /^Point|^Lead/.test(li.textContent))).toHaveLength(5);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getAllByRole("listitem").filter((li) => /^Point|^Lead/.test(li.textContent))).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    const about = screen.getByRole("heading", { name: "About this item" });
    const specs = screen.getByRole("button", { name: "Features & Specs" });
    expect(about.compareDocumentPosition(specs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens and scrolls to the spec panels from See more product details", async () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    mocks.getDetail.mockResolvedValue({ ...base, highlights: hl(2), pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Features & Specs" }));
    await user.click(screen.getByRole("button", { name: "See more product details" }));
    expect(screen.getByRole("button", { name: "Features & Specs" })).toHaveAttribute("aria-expanded", "true");
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ block: "start" }));
    Element.prototype.scrollIntoView = original;
  });

  it("renders nothing extra without brand or highlights", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, highlights: [], pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(screen.queryByRole("heading", { name: "About this item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See more product details" })).not.toBeInTheDocument();
  });

  it("works in the page layout", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, highlights: hl(1), pricing: pricing(300, 300) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount({ layout: "page" });
    await screen.findByRole("heading", { level: 1, name: "Fade and beard" });
    expect(screen.getByRole("heading", { name: "About this item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Features & Specs" })).toBeInTheDocument();
  });
});

describe("ItemDetail flash expiry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const liveFlash = (endsInMs) => ({
    sale: { id: "f", headline: "Weekend deal", quantityNote: null, startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + endsInMs).toISOString() },
    remainingMs: endsInMs
  });

  it("confirms expiry with a refetch, holds the flash view with the ended notice for 6 seconds, then restores regular pricing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.getDetail.mockReset();
    mocks.getDetail.mockResolvedValueOnce({ ...base, pricing: pricing(300, 240), flash: liveFlash(2000) });
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300), flash: null });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByText("Weekend deal");
    expect(chatHrefs()[0]).toContain("flash sale");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(await screen.findByText(/Flash sale ended. Regular price/)).toHaveTextContent("KES 300");
    expect(screen.getByText("Weekend deal")).toBeInTheDocument();
    expect(chatHrefs()[0]).toContain("flash sale");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.queryByText(/Flash sale ended/)).toBeNull();
    expect(screen.queryByText("Weekend deal")).toBeNull();
    expect(chatHrefs()[0]).toBe("https://wa.me/254712555101?text=Hi, I saw Fade and beard (KES 300) on EpicMKT");
  });

  it("shows the no longer available state when the item was unlisted after the sale", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.getDetail.mockReset();
    mocks.getDetail.mockResolvedValueOnce({ ...base, pricing: pricing(300, 240), flash: liveFlash(2000) });
    mocks.getDetail.mockRejectedValue(Object.assign(new Error("Item not found"), { name: "NotFoundError" }));
    mocks.getStoreSelective.mockResolvedValue(selective(3));
    mount();
    await screen.findByText("Weekend deal");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(await screen.findByRole("heading", { name: "This item is no longer available" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Visit Store/ })[0]).toHaveAttribute("href", "/b/fade-kings");
    expect(screen.getByText("Other 0")).toBeInTheDocument();
  });
});
