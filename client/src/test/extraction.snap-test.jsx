import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BusinessCard from "../components/BusinessCard.jsx";
import ItemCard from "../components/ItemCard.jsx";
import ItemGallery from "../components/ItemGallery.jsx";
import Business from "../pages/Business.jsx";

const biz = {
  id: "b_001",
  slug: "fade-kings",
  name: "Fade Kings",
  tagline: "Sharp cuts, every time",
  description: "A neighbourhood barbershop.",
  hue: 24,
  plan: "premium",
  verified: true,
  isOpen: true,
  closesAt: "17:00",
  rating: 4.6,
  reviewCount: 12,
  phone: "0712345678",
  whatsapp: "0712345678",
  lat: -0.0917,
  lng: 34.6,
  address: "Main Street",
  area: "Maseno",
  county: "Kisumu",
  categoryName: "Barbershops",
  categoryIcon: "scissors",
  fromPriceKes: 100,
  distanceKm: 2.4,
  highlights: ["Walk-ins welcome", "Kids cuts"],
  tags: ["fade", "kids"],
  promo: { flash: 1, offers: 2 },
  category: { singular: "Barbershop", name: "Barbershops", icon: "scissors", fields: [] },
  shortcode: "fk1",
  hours: { mon: ["08:00", "17:00"], tue: ["08:00", "17:00"], wed: ["08:00", "17:00"], thu: ["08:00", "17:00"], fri: ["08:00", "17:00"], sat: ["09:00", "14:00"], sun: null },
  offers: [{ id: "o1", title: "Student discount", description: "10% off with ID", expiresAt: "2099-01-01T00:00:00.000Z", code: "STUDENT" }],
  gallery: [
    { id: "g1", url: "/g1.jpg", caption: "Shopfront" },
    { id: "g2", url: "/g2.jpg", caption: "Chairs" }
  ],
  socials: { instagram: "fadekings", facebook: "fadekings" },
  attributes: {},
  services: [
    { id: "fade", name: "Fade", priceKes: 300, section: "Cuts", imageUrl: "/fade.jpg" },
    { id: "kids", name: "Kids cut", priceKes: 100, section: "Cuts" },
    { id: "wash", name: "Wash", priceKes: 50 }
  ]
};

vi.mock("../api/index.js", () => ({ getBusiness: vi.fn(async () => biz), logContactEvent: vi.fn(), reportBusiness: vi.fn() }));
vi.mock("../components/FlashStrip.jsx", () => ({ default: () => null }));
vi.mock("../components/TemplateDetails.jsx", () => ({ default: () => null }));
vi.mock("../components/QrCode.jsx", () => ({ default: () => null }));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => <nav aria-label="page trail" /> }));
vi.mock("../components/ItemDetail.jsx", () => ({ default: () => null }));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-04T09:00:00+03:00") });
});

afterEach(() => vi.clearAllMocks());

const themes = ["light", "dark"];
const frame = (theme, children) => (
  <div data-theme={theme}>
    <MemoryRouter>{children}</MemoryRouter>
  </div>
);

describe.each(themes)("extraction snapshots (%s)", (theme) => {
  it("ShopCard", () => {
    const { container } = render(frame(theme, <BusinessCard business={biz} />));
    expect(container).toMatchSnapshot();
  });

  it("ShopCard without extras", () => {
    const plain = { ...biz, plan: "standard", verified: false, promo: null, highlights: [], fromPriceKes: null, distanceKm: null, reviewCount: 0, isOpen: false, coverUrl: "/c.jpg", logoUrl: "/l.jpg" };
    const { container } = render(frame(theme, <BusinessCard business={plain} />));
    expect(container).toMatchSnapshot();
  });

  it.each(["available", "limited", "unavailable"])("ProductCard %s", (availability) => {
    const item = { id: "i1", name: "Fade", imageUrl: "/fade.jpg", availability, pricing: { salePrice: 270, regularPrice: 300, savings: 30, discountPercent: 10 } };
    const { container } = render(frame(theme, <ItemCard item={item} onSelect={() => {}} />));
    expect(container).toMatchSnapshot();
  });

  it("ProductCard without pricing or image", () => {
    const { container } = render(frame(theme, <ItemCard item={{ id: "i2", name: "Wash" }} />));
    expect(container).toMatchSnapshot();
  });

  it("ProductGallery", () => {
    const images = [
      { id: "a", url: "/a.jpg", caption: "A" },
      { id: "b", url: "/b.jpg", caption: "B" },
      { id: "c", url: "/c.jpg", caption: "C" }
    ];
    const { container } = render(frame(theme, <ItemGallery images={images} name="Fade" />));
    expect(container).toMatchSnapshot();
  });

  it("BusinessPage", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <div data-theme={theme}>
        <MemoryRouter initialEntries={["/b/fade-kings"]}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/b/:slug" element={<Business />} />
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </div>
    );
    await vi.waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Fade Kings" })).toBeInTheDocument());
    expect(container).toMatchSnapshot();
  });
});
