import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("uses the flash sale wording and shows both prices", async () => {
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 240) });
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { name: "Fade and beard" });
    expect(chatHrefs()[0]).toBe("https://wa.me/254712555101?text=Hi, I saw the flash sale on Fade and beard: KES 240 (was KES 300) on EpicMKT");
    expect(screen.getByText("KSh 240")).toBeInTheDocument();
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
