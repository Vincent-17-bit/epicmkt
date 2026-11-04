import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemDetail from "./ItemDetail.jsx";

const pricing = (regular, sale, variants = []) => ({ regularPrice: regular, salePrice: sale, savings: regular - sale, discountPercent: Math.round(((regular - sale) / regular) * 100), unit: "kg", variants });
const view = (id) => ({ offer: { id, title: `Offer ${id}`, kind: "percent_off", value: 10, description: "d", code: "C" }, business: { name: "Shop", slug: "shop", verified: true }, remainingMs: 7200000, appliesToLabel: "All", itemIds: [] });
const base = {
  id: "fade", name: "Fade and beard", brand: "Acme", description: "Sharp cuts for everyone.\n\nSecond paragraph here.", shortDescription: "Sharp.", kind: "product", packSize: "2 kg",
  images: [{ id: "i1", url: "a.png", caption: "x" }, { id: "i2", url: "b.png", caption: "y" }], offers: [], flash: null,
  highlights: [{ title: "Fast", text: "Quick" }, "b", "c", "d", "e", "f", "g"], includes: ["Towel", "Cape"], terms: "No refunds",
  specs: [{ label: "Duration", value: "45 minutes", group: "Measurements" }, { label: "Colour", value: "Red" }],
  availability: "limited_stock", stockCount: 3, section: "Cuts",
  business: { slug: "fade-kings", name: "Fade Kings", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: false, statusLine: "Opens 8am", verified: true }
};
const cases = {
  plain: { ...base, pricing: pricing(300, 300) },
  sale: { ...base, pricing: pricing(300, 240) },
  variants: { ...base, pricing: pricing(300, 300, [{ id: "v1", label: "Small", regularPrice: 300, salePrice: 300, savings: 0, discountPercent: 0 }, { id: "v2", label: "Large", regularPrice: 450, salePrice: 450, savings: 0, discountPercent: 0 }]) },
  offers: { ...base, pricing: pricing(300, 240), offers: [view("a"), view("b"), view("c")], availability: "by_appointment" },
  bare: { id: "x", name: "Bare", images: [], offers: [], flash: null, specs: [], availability: "available", pricing: null, business: base.business }
};
const norm = (html) => html.replace(/svg-inline--fa-title-[A-Za-z0-9]+/g, "fa-title").replace(/_([A-Za-z0-9]+)_[A-Za-z0-9]{5,8}\b/g, "$1").replace(/\bid="[^"]*:r[0-9a-z]+:[^"]*"/g, 'id="X"').replace(/:r[0-9a-z]+:/g, ":rX:").replace(/(aria-controls|aria-labelledby|id)="[^"]*-(head|body|title)"/g, '$1="X-$2"').replace(/class="layout layout" data-variant="(page|sheet)"/g, 'class="layout"');
const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn() }));
vi.mock("../api/index.js", () => ({ logContactEvent: vi.fn(), logEvent: vi.fn(), items: mocks }));

const run = async (Component, data) => {
  mocks.getDetail.mockResolvedValue(data);
  mocks.getStoreSelective.mockResolvedValue([]);
  const { container, unmount } = render(
    <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Component business={{ id: "b_001", slug: "fade-kings", name: "Fade Kings" }} itemId={data.id} onClose={() => {}} onSelect={() => {}} onReport={() => {}} layout="page" />
    </QueryClientProvider></MemoryRouter>
  );
  await screen.findByRole("heading", { name: data.name });
  const html = norm(container.innerHTML);
  unmount();
  return html;
};

const expected = (name) => readFileSync(join(process.cwd(), "src/components/__dom__", `itemDetail-${name}.html`), "utf8");

describe("ItemDetail markup", () => {
  for (const name of Object.keys(cases)) {
    it(`${name} matches the page it replaced`, async () => {
      const html = await run(ItemDetail, cases[name]);
      expect(html.replace(/></g, ">\n<")).toBe(expected(name));
    });
  }
});
