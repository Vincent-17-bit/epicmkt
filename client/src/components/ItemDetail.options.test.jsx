import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { phone, sandisk } from "@epicmkt/shared/options/fixtures";
import ItemDetail from "./ItemDetail.jsx";

// ItemDetail with an item that has option axes: the page follows the choice (price, message to the seller) and the URL keeps it.
const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn() }));
const logEvent = vi.hoisted(() => vi.fn());
vi.mock("../api/index.js", () => ({ logContactEvent: vi.fn(), logEvent, items: mocks }));

const seller = { slug: "shop", name: "Shop", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true };
const pricing = (n) => ({ regularPrice: n, salePrice: n, savings: 0, discountPercent: 0, unit: null, variants: [] });
const detail = (fixture, over = {}) => ({
  id: "it", name: fixture.item.name, description: "d", shortDescription: "s", kind: "product", images: [], offers: [], flash: null, specs: [], availability: "available",
  section: null, business: seller, pricing: pricing(fixture.item.price), options: fixture.options, optionVariants: fixture.optionVariants, defaultVariantId: fixture.defaultVariantId, ...over
});

function Url() {
  return <output data-testid="url">{useLocation().search}</output>;
}
const mount = (url = "/?item=it") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ItemDetail business={{ id: "b1", slug: "shop", name: "Shop" }} itemId="it" onClose={() => {}} onSelect={() => {}} onReport={() => {}} />
        <Url />
      </QueryClientProvider>
    </MemoryRouter>
  );
const chat = () => decodeURIComponent(screen.getAllByRole("link", { name: /Chat Seller/ })[0].getAttribute("href"));
const group = (name) => screen.getByRole("radiogroup", { name: new RegExp(`^${name}:`) });

describe("ItemDetail with options", () => {
  it("opens on the default combination: its price in the header and its name in the message to the seller", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue(detail(phone()));
    mount();
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.getAllByText("KES 21,000").length).toBeGreaterThan(0);
    expect(chat()).toBe("https://wa.me/254712555101?text=Hi, I saw Samsung Galaxy S26 (Grey / 128 GB) (KES 21,000) on EpicMKT");
  });

  it("follows the choice: header price and message change, and ?v= is written", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue(detail(phone()));
    mount();
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(within(group("Storage")).getByRole("radio", { name: /256 GB/ }));
    expect(screen.getByTestId("url").textContent).toBe("?item=it&v=grey.256");
    expect(chat()).toContain("(Grey / 256 GB) (KES 24,000)");
    await userEvent.click(within(group("Color")).getByRole("radio", { name: /Black/ }));
    expect(chat()).toContain("(Black / 256 GB) (KES 25,000)");
  });

  it("a link with ?v= opens that exact choice", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue(detail(phone()));
    mount("/?item=it&v=blue.512");
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(chat()).toContain("(Blue / 512 GB) (KES 30,000)");
  });

  it("a combination that is not sold has no price in the header and none in the message", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    const f = phone();
    f.optionVariants = f.optionVariants.filter((v) => !(v.choice.color === "blue" && v.choice.storage === "512"));
    mocks.getDetail.mockResolvedValue(detail(f));
    mount("/?item=it&v=blue.512");
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.getByText(/combination is not available/i)).toBeInTheDocument();
    expect(chat()).toBe("https://wa.me/254712555101?text=Hi, I saw Samsung Galaxy S26 (Blue / 512 GB) on EpicMKT");
    expect(document.querySelector("[class*=priceBlock]")).toBeNull();
  });

  it("the SanDisk sale: the header shows the sale price with the earlier one struck through", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue(detail(sandisk()));
    mount("/?item=it&v=new.256gb");
    await screen.findByRole("heading", { name: "SanDisk microSD card" });
    expect(screen.getAllByText("KES 12,078").length).toBeGreaterThan(0);
    expect(document.querySelector("s")).not.toBeNull();
    expect(chat()).toBe("https://wa.me/254712555101?text=Hi, I saw SanDisk microSD card (New Version / 256 GB) (KES 12,078) on EpicMKT");
  });

  it("the chat click reports the chosen variant", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue(detail(phone()));
    mount("/?item=it&v=grey.256");
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(screen.getAllByRole("link", { name: /Chat Seller/ })[0]);
    expect(logEvent).toHaveBeenCalledWith("chat_seller_click", expect.objectContaining({ variantId: "v5" }));
  });

  it("during a flash sale the header keeps the flash pricing and the message still names the choice", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    const f = phone();
    const flash = { sale: { id: "s1", endsAt: "2030-01-01T00:00:00Z" }, discount: { type: "percent", value: 20 } };
    mocks.getDetail.mockResolvedValue(detail(f, { flash, pricing: { ...pricing(22000), salePrice: 17600, savings: 4400, discountPercent: 20 } }));
    mount("/?item=it&v=grey.256");
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(chat()).toContain("(Grey / 256 GB)");
  });

  it("an item with no options is untouched: no picker, no ?v=", async () => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({ ...detail(phone()), options: [], optionVariants: [], defaultVariantId: null, pricing: pricing(300) });
    mount();
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(chat()).toBe("https://wa.me/254712555101?text=Hi, I saw Samsung Galaxy S26 (KES 300) on EpicMKT");
    expect(screen.getByTestId("url").textContent).toBe("?item=it");
  });
});
