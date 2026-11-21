import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { phone } from "@epicmkt/shared/options/fixtures";
import ItemDetail from "./ItemDetail.jsx";

const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn(), logContactEvent: vi.fn(), logEvent: vi.fn() }));
vi.mock("../api/index.js", () => ({ logContactEvent: mocks.logContactEvent, logEvent: mocks.logEvent, items: mocks }));

const seller = { slug: "shop", name: "Shop", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true };
const pricing = (n) => ({ regularPrice: n, salePrice: n, savings: 0, discountPercent: 0, unit: null, variants: [] });
const base = { id: "it", description: "d", shortDescription: "s", kind: "product", images: [], offers: [], flash: null, specs: [], availability: "available", section: null, business: seller };
const phoneDetail = (over = {}) => {
  const f = phone();
  return { ...base, name: f.item.name, pricing: pricing(f.item.price), options: f.options, optionVariants: f.optionVariants, defaultVariantId: f.defaultVariantId, ...over };
};
const beef = (over = {}) => ({ ...base, name: "Fresh beef", unit: "kg", quantityMode: "measure", quantity: { min: 0.5, step: 0.25, unit: "kg" }, pricing: pricing(800), ...over });

const mount = (detail) => {
  mocks.getStoreSelective.mockResolvedValue([]);
  mocks.getDetail.mockResolvedValue(detail);
  return render(
    <MemoryRouter initialEntries={["/?item=it"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ItemDetail business={{ id: "b1", slug: "shop", name: "Shop" }} itemId="it" onClose={() => {}} onSelect={() => {}} onReport={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>
  );
};
const order = () => screen.queryByTestId("order-whatsapp");
const orderText = () => decodeURIComponent(order().getAttribute("href"));

const tail = "\nPlease confirm it is available and how I can pay and receive it.\nSent from EpicMKT\nhttp://localhost:3000/b/shop/i/it";
const wa = "https://wa.me/254712555101?text=";

describe("order now", () => {
  it("is absent for an item with no quantity control, so those pages are unchanged", async () => {
    mount(phoneDetail());
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(order()).toBeNull();
  });

  it("names the shop, every chosen option, quantity, price and total, even at quantity 1", async () => {
    mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(orderText()).toBe(`${wa}Hi Shop, I'd like to order:\n\n*Samsung Galaxy S26*\nColor: Grey\nStorage: 128 GB\nQuantity: 1\nPrice: KES 21,000 each\nTotal: KES 21,000\n${tail}`);
    expect(order()).toHaveAttribute("target", "_blank");
  });

  it("follows the chosen option and the quantity", async () => {
    mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(within(screen.getByRole("radiogroup", { name: /^Storage:/ })).getByRole("radio", { name: /256 GB/ }));
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(orderText()).toBe(`${wa}Hi Shop, I'd like to order:\n\n*Samsung Galaxy S26*\nColor: Grey\nStorage: 256 GB\nQuantity: 2\nPrice: KES 24,000 each\nTotal: KES 48,000\n${tail}`);
  });

  it("says an amount and a price per unit for a weighed item", async () => {
    mount(beef());
    await screen.findByRole("heading", { name: "Fresh beef" });
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(orderText()).toContain("*Fresh beef*\nAmount: 0.75 kg\nPrice: KES 800 per kg\nTotal: KES 600\n");
    expect(orderText()).not.toContain("Quantity:");
  });

  it("says book for a service", async () => {
    mount(beef({ kind: "service", name: "Home braiding" }));
    await screen.findByRole("heading", { name: "Home braiding" });
    expect(orderText()).toContain("Hi Shop, I'd like to book:");
  });

  it("strips asterisks from names so the bold line stays whole", async () => {
    mount(beef({ name: "Beef *premium*" }));
    await screen.findByRole("heading", { name: "Beef *premium*" });
    expect(orderText()).toContain("\n*Beef premium*\n");
  });

  it("leaves out the unit price for tier-priced items and keeps the tier total", async () => {
    const printing = { ...base, name: "Photocopy", unit: "page", pricing: pricing(10), priceTiers: [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }], priceTierMode: "whole" };
    mount(printing);
    await screen.findByRole("heading", { name: "Photocopy" });
    const box = screen.getByRole("spinbutton");
    await userEvent.clear(box);
    await userEvent.type(box, "11");
    expect(orderText()).toContain("*Photocopy*\nQuantity: 11\nTotal: KES 77\n");
  });

  it("ignores the seller's own greeting: the button always sends the order", async () => {
    mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(orderText()).toContain("I'd like to order:");
  });

  it("is hidden when the seller has no WhatsApp number", async () => {
    mount(phoneDetail({ quantityMode: "units", business: { ...seller, whatsapp: "" } }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(order()).toBeNull();
  });

  it("counts the tap as a WhatsApp contact from the order placement", async () => {
    mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    order().addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(order());
    expect(mocks.logContactEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "whatsapp" }));
    expect(mocks.logEvent).toHaveBeenCalledWith("chat_seller_click", expect.objectContaining({ placement: "order", quantity: 1 }));
  });
});
