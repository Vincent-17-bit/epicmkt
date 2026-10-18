import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemPage from "./ItemPage.jsx";

const pricing = (regular, sale, extra = {}) => ({
  regularPrice: regular,
  salePrice: sale,
  savings: regular - sale,
  discountPercent: Math.round(((regular - sale) / regular) * 100),
  unit: null,
  variants: [],
  ...extra
});

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

const base = {
  id: "fade",
  name: "Fade and beard",
  description: "Sharp.",
  shortDescription: "Sharp.",
  images: [
    { id: "i1", url: "a.png", caption: "x" },
    { id: "i2", url: "b.png", caption: "y" }
  ],
  kind: "service",
  offers: [],
  flash: null,
  includes: [],
  terms: "",
  specs: [],
  priceType: "fixed",
  availability: "available",
  section: "Cuts",
  business: { id: "b_001", slug: "fade-kings", name: "Fade Kings", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true, lat: 0, lng: 0 }
};

const biz = {
  id: "b_001",
  slug: "fade-kings",
  name: "Fade Kings",
  categoryId: "barbershops",
  area: "Maseno",
  county: "Kisumu",
  address: "Main St",
  isOpen: true,
  closesAt: "20:00",
  hours: { mon: ["08:00", "20:00"], tue: ["08:00", "20:00"], wed: ["08:00", "20:00"], thu: ["08:00", "20:00"], fri: ["08:00", "20:00"], sat: ["08:00", "20:00"], sun: ["08:00", "20:00"] },
  category: { id: "barbershops", name: "Barbershops", singular: "Barbershop", fields: [] },
  attributes: {},
  services: [{ id: "fade", name: "Fade and beard" }, { id: "kids", name: "Kids cut" }]
};

const flashOf = (endsAt, extra = {}) => ({
  sale: { id: "s1", startsAt: inHours(-1), endsAt, headline: "Weekend deal", quantityNote: "Only 5 slots", ...extra },
  pricing: pricing(300, 225),
  remainingMs: 1
});

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  getStoreSelective: vi.fn(async () => []),
  getSimilar: vi.fn(async () => []),
  getBusiness: vi.fn(),
  flashList: vi.fn(async () => ({ items: [], total: 0 })),
  logEvent: vi.fn(),
  logContactEvent: vi.fn()
}));

vi.mock("../api/index.js", () => ({
  items: { getDetail: mocks.getDetail, getStoreSelective: mocks.getStoreSelective, getSimilar: mocks.getSimilar },
  flash: { list: mocks.flashList },
  getBusiness: mocks.getBusiness,
  getCategories: vi.fn(async () => [{ id: "barbershops", name: "Barbershops", group: "Beauty and grooming" }]),
  getTowns: vi.fn(async () => []),
  getSearchFacets: vi.fn(),
  getServerTime: vi.fn(async () => ({ now: new Date().toISOString() })),
  logEvent: mocks.logEvent,
  logContactEvent: mocks.logContactEvent,
  reportBusiness: vi.fn()
}));

function viewport(width) {
  window.matchMedia = (query) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    return { matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
}

const mount = (path = "/b/fade-kings/item/fade") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/b/:slug/item/:itemId" element={<ItemPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

const load = (detail = {}) => {
  mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300), ...detail });
  mocks.getBusiness.mockResolvedValue(biz);
};

const buy = () => within(screen.getByRole("heading", { level: 1 }).closest("section"));

const ready = () => screen.findByRole("heading", { level: 1, name: "Fade and beard" });

beforeEach(() => {
  mocks.flashList.mockResolvedValue({ items: [], total: 0 });
  mocks.getSimilar.mockResolvedValue([]);
  mocks.getStoreSelective.mockResolvedValue([]);
  viewport(1280);
  document.head.querySelectorAll("#item-jsonld, link[rel=canonical], link[rel=preload]").forEach((n) => n.remove());
});

afterEach(() => vi.clearAllMocks());

describe("ItemPage layout and actions", () => {
  it("renders one h1, the store line and the regular price", async () => {
    load({ pricing: pricing(300, 300, { unit: "cut" }) });
    mount();
    await ready();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(buy().getByText("KES 300")).toBeInTheDocument();
    expect(buy().getByText("/ cut")).toBeInTheDocument();
    expect(screen.queryByTestId("flash-row")).toBeNull();
    expect(screen.queryByText(/% off/)).toBeNull();
  });

  it("builds the WhatsApp message and links Visit Store from the top, the store card and the bottom bar", async () => {
    load();
    mount();
    await ready();
    const chats = screen.getAllByRole("link", { name: /Chat Seller/ });
    expect(chats).toHaveLength(3);
    chats.forEach((a) => expect(decodeURIComponent(a.getAttribute("href"))).toBe("https://wa.me/254712555101?text=Hi, I saw Fade and beard (KES 300) on EpicMKT"));
    const stores = screen.getAllByRole("link", { name: /Visit Store/ });
    expect(stores).toHaveLength(3);
    stores.forEach((a) => expect(a).toHaveAttribute("href", "/b/fade-kings"));
  });

  it("never offers a cart or checkout and keeps the order disclaimer", async () => {
    load();
    mount();
    await ready();
    expect(screen.queryByRole("button", { name: /add to cart|buy now|checkout/i })).toBeNull();
    expect(screen.getAllByText(/EpicMKT does not process orders or payments/).length).toBeGreaterThan(0);
  });

  it("sets the document title, canonical link and JSON-LD for the item page", async () => {
    load();
    mount();
    await ready();
    await waitFor(() => expect(document.title).toBe("Fade and beard | Fade Kings | EpicMKT"));
    expect(document.head.querySelector("link[rel=canonical]").getAttribute("href")).toMatch(/\/b\/fade-kings\/item\/fade$/);
    expect(document.head.querySelector('meta[name="description"]').getAttribute("content")).toContain("Fade and beard");
    const ld = JSON.parse(document.getElementById("item-jsonld").textContent);
    expect(ld["@type"]).toBe("Service");
    expect(ld.url).toMatch(/\/b\/fade-kings\/item\/fade$/);
  });

  it("shows the trail home, group, category, business, item with the item as the current page", async () => {
    load();
    mount();
    await ready();
    const nav = screen.getAllByRole("navigation", { name: "Breadcrumb" })[0];
    await waitFor(() => expect(within(nav).getByText("Beauty and grooming")).toBeInTheDocument());
    expect(within(nav).getByRole("link", { name: "Barbershops" })).toHaveAttribute("href", "/c/barbershops");
    expect(within(nav).getByRole("link", { name: "Fade Kings" })).toHaveAttribute("href", "/b/fade-kings");
    expect(within(nav).getByText("Fade and beard")).toHaveAttribute("aria-current", "page");
  });
});

describe("ItemPage flash sale", () => {
  it("shows the calm flash row, struck price, discount chip and savings", async () => {
    load({ pricing: pricing(300, 225), flash: flashOf(inHours(2)) });
    mount();
    await ready();
    const row = screen.getByTestId("flash-row");
    expect(within(row).getByText("Flash sale")).toBeInTheDocument();
    expect(row).toHaveTextContent(/Closing in\s*(02 : 00 : 0\d|01 : 59 : \d\d)/);
    expect(buy().getByText("KES 225")).toBeInTheDocument();
    expect(buy().getByText("KES 300").tagName).toBe("S");
    expect(buy().getByText("25% off")).toBeInTheDocument();
    expect(buy().getByText(/You save KES 75/)).toBeInTheDocument();
    expect(decodeURIComponent(screen.getAllByRole("link", { name: /Chat Seller/ })[0].getAttribute("href"))).toContain("flash sale on Fade and beard: KES 225 (was KES 300)");
  });

  it("lists the sale window and quantity under additional details and the headline under about", async () => {
    load({ pricing: pricing(300, 225), flash: flashOf(inHours(2)) });
    mount();
    await ready();
    expect(screen.getByText("Sale starts")).toBeInTheDocument();
    expect(screen.getByText("Sale ends")).toBeInTheDocument();
    expect(screen.getAllByText(/EAT$/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Only 5 slots", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("Weekend deal")).toBeInTheDocument();
  });

  it("hides the flash row and falls back to the regular price once the sale has ended", async () => {
    load({ pricing: pricing(300, 225), flash: flashOf(inHours(-0.01)) });
    mount();
    await ready();
    expect(screen.queryByTestId("flash-row")).toBeNull();
    expect(screen.queryByText("25% off")).toBeNull();
    expect(buy().getByText("KES 300")).toBeInTheDocument();
    expect(screen.queryByText("KES 225")).toBeNull();
    expect(screen.queryByText("Sale starts")).toBeNull();
  });

  it("does not show a flash row for a regular item", async () => {
    load();
    mount();
    await ready();
    expect(screen.queryByTestId("flash-row")).toBeNull();
  });
});

describe("ItemPage availability and variants", () => {
  it("explains an out-of-stock item and keeps the contact actions", async () => {
    load({ availability: "unavailable" });
    mount();
    await ready();
    expect(screen.getAllByText("Out of stock").length).toBeGreaterThan(1);
    expect(screen.getByText(/ask when it will be back/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Chat Seller/ }).length).toBeGreaterThan(0);
  });

  it("notes limited stock", async () => {
    load({ availability: "limited" });
    mount();
    await ready();
    expect(buy().getByText("Limited stock")).toBeInTheDocument();
    expect(buy().getByText(/Only a few left/)).toBeInTheDocument();
  });

  const variants = [
    { id: "s", label: "Small", regularPrice: 3500, salePrice: 3500, savings: 0, discountPercent: 0 },
    { id: "m", label: "Medium", regularPrice: 2500, salePrice: 2500, savings: 0, discountPercent: 0 }
  ];

  it("selects the default variant, updates the price and message, and supports arrow keys", async () => {
    const user = userEvent.setup();
    load({ pricing: { ...pricing(2500, 2500), variants } });
    mount();
    await screen.findByRole("radio", { name: "Medium", checked: true });
    expect(screen.getAllByText("KES 2,500").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("radio", { name: "Small" }));
    expect(screen.getByRole("radio", { name: "Small", checked: true })).toBeInTheDocument();
    expect(screen.getAllByText("KES 3,500").length).toBeGreaterThan(0);
    expect(decodeURIComponent(screen.getAllByRole("link", { name: /Chat Seller/ })[0].getAttribute("href"))).toContain("Fade and beard (Small) (KES 3,500)");

    screen.getByRole("radio", { name: "Small" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Medium", checked: true })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Small", checked: true })).toHaveFocus();
  });

  it("uses a roving tab stop so only the selected option is tabbable", async () => {
    load({ pricing: { ...pricing(2500, 2500), variants } });
    mount();
    await screen.findByRole("radio", { name: "Medium", checked: true });
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Small" })).toHaveAttribute("tabindex", "-1");
  });
});

describe("ItemPage content sections", () => {
  it("hides empty sections and keeps the description and additional details", async () => {
    load({ description: "", shortDescription: "" });
    mount();
    await ready();
    expect(screen.getByRole("heading", { level: 2, name: "Item description" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Service details" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "About this item" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Additional details" })).toBeInTheDocument();
  });

  it("renders the spec table, highlights and terms from the API", async () => {
    load({
      specs: [{ label: "Duration", value: "45 minutes" }, { label: "Hygiene", value: "Fresh towel" }],
      includes: ["Hot towel", "Neck shave"],
      terms: "Arrive 5 minutes early"
    });
    mount();
    await ready();
    expect(screen.getByRole("heading", { level: 2, name: "Service details" })).toBeInTheDocument();
    expect(screen.getByText("Duration").tagName).toBe("DT");
    expect(screen.getByText("45 minutes").tagName).toBe("DD");
    expect(screen.getByRole("heading", { level: 2, name: "About this item" })).toBeInTheDocument();
    expect(screen.getByText("Hot towel")).toBeInTheDocument();
    expect(screen.getByText("Arrive 5 minutes early")).toBeInTheDocument();
  });

  it("truncates a long description with Read more and shows it in full under About", async () => {
    const long = `${"Sharp cuts and calm service. ".repeat(40)}THE END`;
    const user = userEvent.setup();
    load({ description: long });
    mount();
    await ready();
    const overview = () => within(document.getElementById("item-overview"));
    expect(overview().queryByText(/THE END/)).toBeNull();
    expect(within(document.getElementById("item-about")).getByText(/THE END/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Read more" }));
    expect(overview().getByText(/THE END/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read less" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { level: 2, name: "About this item" })).toBeInTheDocument();
  });

  it("shows the desktop tabs for the sections that exist", async () => {
    load({ specs: [{ label: "Duration", value: "45 minutes" }] });
    mount();
    await ready();
    const tabs = screen.getByRole("navigation", { name: "Item sections" });
    expect(within(tabs).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: "Details" })).toBeInTheDocument();
    expect(within(tabs).queryByRole("button", { name: "About" })).toBeNull();
  });
});

describe("ItemPage on phones", () => {
  beforeEach(() => viewport(375));

  it("renders sections as accordions with only the first open", async () => {
    const user = userEvent.setup();
    load({ specs: [{ label: "Duration", value: "45 minutes" }] });
    mount();
    await ready();
    expect(screen.queryByRole("navigation", { name: "Item sections" })).toBeNull();
    const first = screen.getByRole("button", { name: "Item description" });
    const details = screen.getByRole("button", { name: "Service details" });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("45 minutes")).not.toBeVisible();
    await user.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("45 minutes")).toBeVisible();
  });

  it("shows the bottom bar with the price, Chat Seller and Visit Store", async () => {
    load({ pricing: pricing(300, 225), flash: flashOf(inHours(2)) });
    mount();
    await ready();
    const bar = screen.getByRole("navigation", { name: "Contact actions" });
    expect(within(bar).getByText("KES 225")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: /Chat Seller/ })).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: /Visit Store/ })).toHaveAttribute("href", "/b/fade-kings");
  });
});

describe("ItemPage more items", () => {
  const entry = (id, businessId, slug) => ({
    sale: { id: `s-${businessId}-${id}`, startsAt: inHours(-1), endsAt: inHours(3), discount: { type: "percent", value: 20 } },
    item: { id, name: `Deal ${slug}`, imageUrl: "d.png" },
    pricing: pricing(100, 80),
    business: { id: businessId, slug, name: slug, isOpen: true, verified: false },
    remainingMs: 3 * 3600000
  });

  it("excludes only this store's copy of the item from other flash deals (ids repeat across stores)", async () => {
    load();
    mocks.flashList.mockResolvedValue({ items: [entry("fade", "b_001", "fade-kings"), entry("fade", "b_002", "sharp-cutz")], total: 2 });
    mount();
    await ready();
    expect(await screen.findByRole("heading", { level: 3, name: "Other flash deals" })).toBeInTheDocument();
    const cards = screen.getAllByRole("link", { name: /Flash sale: Deal/ });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("href", "/b/sharp-cutz/item/fade");
  });

  it("hides the whole section when there is nothing to explore", async () => {
    load();
    mount();
    await ready();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "More items to explore" })).toBeNull());
    expect(screen.queryByRole("button", { name: "More items" })).toBeNull();
  });

  it("shows similar items from other stores with links to their own item pages", async () => {
    load();
    mocks.getSimilar.mockResolvedValue([{ id: "cut", businessSlug: "sharp-cutz", name: "Classic cut", imageUrl: "c.png", availability: "available", pricing: pricing(200, 200) }]);
    mount();
    await ready();
    expect(await screen.findByRole("heading", { level: 2, name: "More items to explore" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Classic cut/ })).toHaveAttribute("href", "/b/sharp-cutz/item/cut");
    expect(mocks.getSimilar).toHaveBeenCalledWith("fade", expect.objectContaining({ businessId: "fade-kings" }));
  });
});

describe("ItemPage states", () => {
  it("shows the gone state with Visit Store when the item is removed", async () => {
    mocks.getDetail.mockRejectedValue(Object.assign(new Error("nf"), { name: "NotFoundError" }));
    mocks.getBusiness.mockResolvedValue(biz);
    mount("/b/fade-kings/item/missing");
    expect(await screen.findByRole("heading", { level: 1, name: "This item is no longer available" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visit Store/ })).toHaveAttribute("href", "/b/fade-kings");
    expect(screen.queryByRole("navigation", { name: "Contact actions" })).toBeNull();
  });

  it("shows an alert with Try again when loading fails, and recovers", async () => {
    const user = userEvent.setup();
    mocks.getDetail.mockRejectedValueOnce(new Error("boom"));
    mocks.getBusiness.mockResolvedValue(biz);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load this item/);
    mocks.getDetail.mockResolvedValue({ ...base, pricing: pricing(300, 300) });
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await ready();
  });

  it("shows a skeleton with aria-busy while loading", () => {
    mocks.getDetail.mockReturnValue(new Promise(() => {}));
    mocks.getBusiness.mockReturnValue(new Promise(() => {}));
    const { container } = mount();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
