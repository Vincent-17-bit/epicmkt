import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import { phone } from "@epicmkt/shared/options/fixtures";
import ItemDetail from "./ItemDetail.jsx";

// Made to measure on the item page: the seller turns it on, the buyer switches it on, gives measurements, and the message says exactly what was chosen.
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
const dress = { enabled: true, axisKey: "size", fields: [{ key: "bust", label: "Bust", unit: "cm", min: 60, max: 200, required: true }, { key: "waist", label: "Waist", unit: "cm", min: 40, max: 200, required: true }], price: { mode: "fixed", base: 4500 } };

describe("made to measure on the item page", () => {
  it("is not offered unless the seller turned it on", async () => {
    mount(phoneDetail());
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    expect(screen.queryByRole("switch", { name: "Made to measure" })).toBeNull();
  });

  it("opens the measurements, and the message to the seller says what was chosen once they are valid", async () => {
    mount(phoneDetail({ customSize: dress }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    const sw = screen.getByRole("switch", { name: "Made to measure" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText(/Bust/)).toBeNull();
    expect(chat()).toContain("(KES 21,000)");
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.type(screen.getByLabelText(/Bust/), "92");
    expect(chat()).toContain("(KES 21,000)");
    await userEvent.type(screen.getByLabelText(/Waist/), "74");
    expect(screen.getAllByText("KES 4,500").length).toBeGreaterThan(0);
    expect(chat()).toBe("https://wa.me/254712555101?text=Hi, I'd like Samsung Galaxy S26, Made to measure: Bust 92 cm, Waist 74 cm, KES 4,500 on EpicMKT\nhttp://localhost:3000/b/shop/i/it");
  });

  it("switching it off goes back to the plain message", async () => {
    mount(phoneDetail({ customSize: dress }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    const sw = screen.getByRole("switch", { name: "Made to measure" });
    await userEvent.click(sw);
    await userEvent.type(screen.getByLabelText(/Bust/), "92");
    await userEvent.type(screen.getByLabelText(/Waist/), "74");
    await userEvent.click(sw);
    expect(screen.queryByLabelText(/Bust/)).toBeNull();
    expect(chat()).toContain("(KES 21,000)");
  });

  it("has no serious accessibility problems with the form open", async () => {
    const { container } = mount(phoneDetail({ customSize: dress }));
    await screen.findByRole("heading", { name: "Samsung Galaxy S26" });
    await userEvent.click(screen.getByRole("switch", { name: "Made to measure" }));
    expect((await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });
});
