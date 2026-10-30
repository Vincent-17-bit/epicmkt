import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows an item's videos as thumbnails that never autoplay, and nothing when it has none", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300), media: [{ id: "i1", kind: "image", url: "a.jpg", caption: "Fade and beard" }, { id: "v1", kind: "video", url: "a.mp4", caption: "Fade and beard", durationSec: 12 }, { id: "v2", kind: "video", url: "b.webm", caption: "Fade and beard", durationSec: 5 }] });
    const { container, unmount } = mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(screen.getAllByRole("button", { name: "Watch video: Fade and beard" })).toHaveLength(2);
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    videos.forEach((v) => {
      expect(v.hasAttribute("autoplay")).toBe(false);
      expect(v.muted).toBe(true);
    });
    unmount();
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    const plain = mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(plain.container.querySelector("video")).toBeNull();
  });

  it("shows photos and videos in one gallery in the seller's order, with a video allowed first", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({
      ...base,
      pricing: pricing(300, 300),
      media: [
        { id: "v1", kind: "video", url: "a.mp4", caption: "Fade and beard", durationSec: 75 },
        { id: "i1", kind: "image", url: "p1.jpg", caption: "Fade and beard" },
        { id: "v2", kind: "video", url: "b.mp4", caption: "Fade and beard", durationSec: null },
        { id: "i2", kind: "image", url: "p2.jpg", caption: "Fade and beard" },
      ],
    });
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    const track = screen.getByRole("group", { name: "Fade and beard" });
    const slides = [...track.children];
    expect(slides).toHaveLength(4);
    expect(within(slides[0]).getByRole("button", { name: "Watch video: Fade and beard" })).toBeInTheDocument();
    expect(slides[1]).toHaveAttribute("aria-label", "Zoom photo 1 / 2");
    expect(within(slides[2]).getByRole("button", { name: "Watch video: Fade and beard" })).toBeInTheDocument();
    expect(slides[3]).toHaveAttribute("aria-label", "Zoom photo 2 / 2");
    expect(screen.getAllByRole("button", { name: /^(Photo|Video) \d$/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Video 1", "Photo 1", "Video 2", "Photo 2"]);
    expect(screen.getAllByText("1:15")).toHaveLength(2);
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
    mocks.getDetail.mockResolvedValue({ ...base, description: "Full", pricing: pricing(300, 300) });
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
    await user.click(screen.getByRole("button", { name: "Description" }));
    expect(logEvent).toHaveBeenCalledWith("spec_expand", expect.objectContaining({ panel: "description" }));
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
