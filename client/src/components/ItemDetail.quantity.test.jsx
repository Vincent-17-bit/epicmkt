import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import { phone } from "@epicmkt/shared/options/fixtures";
import ItemDetail from "./ItemDetail.jsx";

// 11.3 / C11 / C12: one quantity on the item page. Units and measured items get a stepper and a total, and the message to the seller says so.
const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn() }));
vi.mock("../api/index.js", () => ({ logContactEvent: vi.fn(), logEvent: vi.fn(), items: mocks }));
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

const seller = { slug: "shop", name: "Shop", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true };
const pricing = (n, sale = n) => ({ regularPrice: n, salePrice: sale, savings: n - sale, discountPercent: n > 0 ? Math.round(((n - sale) / n) * 100) : 0, unit: null, variants: [] });
const phoneDetail = (over = {}) => {
  const f = phone();
  return { id: "it", name: f.item.name, description: "d", shortDescription: "s", kind: "product", images: [], offers: [], flash: null, specs: [], availability: "available", section: null, business: seller, pricing: pricing(f.item.price), options: f.options, optionVariants: f.optionVariants, defaultVariantId: f.defaultVariantId, ...over };
};
const beef = (over = {}) => ({ id: "it", name: "Fresh beef", description: "d", shortDescription: "s", kind: "product", images: [], offers: [], flash: null, specs: [], availability: "available", section: null, business: seller, unit: "kg", quantityMode: "measure", quantity: { min: 0.5, step: 0.25, unit: "kg" }, pricing: pricing(800), ...over });

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
const chat = () => decodeURIComponent(screen.getAllByRole("link", { name: /Chat Seller/ })[0].getAttribute("href"));
const order = () => decodeURIComponent(screen.getByTestId("order-whatsapp").getAttribute("href"));
const box = () => screen.getByRole("textbox", { name: /How (many|much)/ });
const total = () => screen.getByTestId("quantity-total").textContent;

describe("quantity on the item page: units", () => {
  it("gives an item with no type the whole-unit stepper, and the chat message is unchanged", async () => {
    mount(phoneDetail());
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.getByTestId("quantity")).toBeInTheDocument();
    expect(chat()).toContain("(Grey / 128 GB) (KES 21,000)");
  });

  it("gives a service no stepper", async () => {
    mount(phoneDetail({ kind: "service" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.queryByTestId("quantity")).toBeNull();
  });

  it("hides the stepper for quantityMode none", async () => {
    mount(phoneDetail({ quantityMode: "none" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.queryByTestId("quantity")).toBeNull();
  });

  it("totals 1, 2 and 3 of the chosen combination; the price is not the same for 2 as for 1", async () => {
    mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(total()).toBe("KES 21,000 for 1");
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(total()).toBe("KES 42,000 for 2");
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(total()).toBe("KES 63,000 for 3");
    await userEvent.click(within(screen.getByRole("radiogroup", { name: /^Storage:/ })).getByRole("radio", { name: /256 GB/ }));
    expect(total()).toBe("KES 72,000 for 3");   // Grey 256 GB is KES 24,000
  });

  it("puts the quantity, the choice and the total in the message to the seller", async () => {
    mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(within(screen.getByRole("radiogroup", { name: /^Storage:/ })).getByRole("radio", { name: /256 GB/ }));
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(order()).toBe("https://wa.me/254712555101?text=Hi Shop, I'd like to order:\n\n*Samsung Galaxy S26*\nColor: Grey\nStorage: 256 GB\nQuantity: 2\nPrice: KES 24,000 each\nTotal: KES 48,000\n\nPlease confirm it is available and how I can pay and receive it.\nSent from EpicMKT\nhttp://localhost:3000/b/shop/i/it?v=grey.256");
    expect(chat()).toBe("https://wa.me/254712555101?text=Hi, I saw Samsung Galaxy S26 (Grey / 256 GB) (KES 24,000) on EpicMKT\nhttp://localhost:3000/b/shop/i/it?v=grey.256");
  });

  it("never goes below 1: the minus button stops, and typed 0 and -2 are corrected", async () => {
    mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.getByRole("button", { name: "One less" })).toBeDisabled();
    await userEvent.clear(box());
    await userEvent.type(box(), "0");
    await userEvent.tab();
    expect(box()).toHaveValue("1");
    await userEvent.clear(box());
    await userEvent.type(box(), "-2");
    await userEvent.tab();
    expect(box()).toHaveValue("1");
    expect(total()).toBe("KES 21,000 for 1");
  });

  it("stops at the stock that is left and says so", async () => {
    const f = phoneDetail({ quantityMode: "units" });
    f.optionVariants = f.optionVariants.map((v) => (v.choice.color === "grey" && v.choice.storage === "128" ? { ...v, stockLeft: 3 } : v));
    mount(f);
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.clear(box());
    await userEvent.type(box(), "9");
    await userEvent.tab();
    expect(box()).toHaveValue("3");
    expect(screen.getByText("Only 3 available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "One more" })).toBeDisabled();
    expect(total()).toBe("KES 63,000 for 3");
  });

  it("follows a flash sale: the total uses the price the page shows", async () => {
    mount(phoneDetail({ quantityMode: "units", pricing: pricing(21000, 18000), flash: { sale: { id: "s", endsAt: new Date(Date.now() + 3_600_000).toISOString(), startsAt: new Date().toISOString() }, pricing: pricing(21000, 18000), remainingMs: 3_600_000 } }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(total()).toBe("KES 36,000 for 2");
  });

  it("has no serious accessibility violations", async () => {
    const { container } = mount(phoneDetail({ quantityMode: "units" }));
    await screen.findByTestId("quantity");
    const found = (await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(found.map((v) => v.id)).toEqual([]);
  });
});

describe("quantity on the item page: measured (kg)", () => {
  it("starts at the least the seller sells, steps by a quarter kilo and shows per kg x amount = total", async () => {
    mount(beef());
    await screen.findByRole("heading", { name: "Fresh beef" });
    expect(box()).toHaveValue("0.5");
    expect(total()).toBe("KES 800 per kg x 0.5 kg = KES 400");
    expect(screen.getByRole("button", { name: "One less" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    await userEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(box()).toHaveValue("1.25");
    expect(total()).toBe("KES 800 per kg x 1.25 kg = KES 1,000");
  });

  it("rounds a typed amount to the nearest step: 1.6 kg becomes 1.5 kg, KES 1,200", async () => {
    mount(beef());
    await screen.findByRole("heading", { name: "Fresh beef" });
    await userEvent.clear(box());
    await userEvent.type(box(), "1.6");
    await userEvent.tab();
    expect(box()).toHaveValue("1.5");
    expect(total()).toBe("KES 800 per kg x 1.5 kg = KES 1,200");
  });

  it('says it in the message: "Fresh beef, 1.5 kg, KES 1,200"', async () => {
    mount(beef());
    await screen.findByRole("heading", { name: "Fresh beef" });
    await userEvent.clear(box());
    await userEvent.type(box(), "1.5");
    await userEvent.tab();
    expect(order()).toBe("https://wa.me/254712555101?text=Hi Shop, I'd like to order:\n\n*Fresh beef*\nAmount: 1.5 kg\nPrice: KES 800 per kg\nTotal: KES 1,200\n\nPlease confirm it is available and how I can pay and receive it.\nSent from EpicMKT\nhttp://localhost:3000/b/shop/i/it");
  });

  it("corrects 0 and a negative to the least, and passes axe", async () => {
    const { container } = mount(beef());
    await screen.findByRole("heading", { name: "Fresh beef" });
    await userEvent.clear(box());
    await userEvent.type(box(), "0");
    await userEvent.tab();
    expect(box()).toHaveValue("0.5");
    expect(screen.getByText("The least you can order is 0.5 kg")).toBeInTheDocument();
    const found = (await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(found.map((v) => v.id)).toEqual([]);
  });
});

describe("quantity on the item page: quantity tiers", () => {
  const printing = (over = {}) => ({ id: "it", name: "Photocopy", description: "d", shortDescription: "s", kind: "product", images: [], offers: [], flash: null, specs: [], availability: "available", section: null, business: seller, unit: "page", pricing: pricing(10), priceTiers: [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }], priceTierMode: "whole", ...over });

  it("the tier table's quantity is the page's: its total reaches the message to the seller", async () => {
    mount(printing());
    await screen.findByRole("heading", { name: "Photocopy" });
    expect(chat()).toContain("(KES 10)");
    const box = screen.getByRole("spinbutton");
    await userEvent.clear(box);
    await userEvent.type(box, "11");
    expect(screen.getByTestId("tiers-total").textContent).toContain("KES 77");
    expect(order()).toBe("https://wa.me/254712555101?text=Hi Shop, I'd like to order:\n\n*Photocopy*\nQuantity: 11\nTotal: KES 77\n\nPlease confirm it is available and how I can pay and receive it.\nSent from EpicMKT\nhttp://localhost:3000/b/shop/i/it");
    expect(screen.queryByTestId("quantity")).toBeNull();   // one control, not two
  });
});
