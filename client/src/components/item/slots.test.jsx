import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import Delivery from "./Delivery.jsx";
import Flash from "./Flash.jsx";
import FlashSticky from "./FlashSticky.jsx";
import ItemLayout from "./ItemLayout.jsx";
import Offers from "./Offers.jsx";
import Quantity from "./Quantity.jsx";
import Recommend, { StoreMore } from "./Recommend.jsx";
import SoldFrom from "./SoldFrom.jsx";
import { Gone, LoadFailed, Loading } from "./States.jsx";
import StickyNav from "./StickyNav.jsx";
import TopBar from "./TopBar.jsx";

// The slots that fetch or tick on their own are stood in for; their own tests cover them. What is tested here is each slot's
// contract: what it shows, and that it shows nothing when it has nothing to show.
vi.mock("../FlashBanner.jsx", () => ({ default: ({ ended }) => <div data-testid="banner" data-ended={String(ended)} /> }));
vi.mock("../FlashStickyBar.jsx", () => ({ default: ({ visible, price }) => <div data-testid="sticky-price" data-visible={String(visible)}>{price}</div> }));
vi.mock("../SimilarItems.jsx", () => ({ default: ({ itemId, businessId }) => <div data-testid="similar" data-item={itemId} data-business={businessId} /> }));
vi.mock("../StoreSelective.jsx", () => ({
  default: ({ excludeItemId, onSelect, onSeeAll }) => (
    <div data-testid="selective" data-exclude={excludeItemId}>
      <button type="button" onClick={() => onSelect({ id: "n1" }, 0)}>pick</button>
      <button type="button" onClick={onSeeAll}>see all</button>
    </div>
  )
}));

const pricing = (regular, sale, variants = []) => ({ regularPrice: regular, salePrice: sale, savings: regular - sale, discountPercent: Math.round(((regular - sale) / regular) * 100), unit: null, variants });
const seller = { slug: "fade-kings", name: "Fade Kings", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true };
const offerView = (id) => ({ offer: { id, title: `Offer ${id}`, kind: "percent_off", value: 10, description: "d", code: "C" }, business: { name: "Shop", slug: "shop", verified: true }, remainingMs: 7200000, appliesToLabel: "All", itemIds: [] });
const item = {
  id: "fade", name: "Fade and beard", description: "Sharp cuts.", shortDescription: "Sharp.", kind: "product", images: [{ id: "i1", url: "a.png", caption: "x" }],
  offers: [], flash: null, specs: [{ label: "Duration", value: "45 minutes" }], availability: "available", pricing: pricing(300, 300), business: seller
};
const flashItem = { ...item, flash: { sale: { id: "s1", endsAt: "2030-01-01T00:00:00Z" } }, pricing: pricing(300, 240) };

const make = (over = {}) => {
  const ctx = {
    item,
    itemId: "fade",
    business: { id: "b_001", slug: "fade-kings", name: "Fade Kings" },
    layout: "page",
    isPage: true,
    vanished: false,
    shown: item.pricing,
    variant: null,
    activeId: null,
    selectVariant: vi.fn(),
    seller,
    sellerCount: null,
    distanceKm: undefined,
    chatHref: "https://wa.me/254712555101?text=Hi",
    hold: null,
    bannerRef: { current: null },
    bannerInView: false,
    Heading: "h1",
    titleRef: { current: null },
    track: vi.fn(),
    onChat: vi.fn(() => vi.fn()),
    onVisit: vi.fn(() => vi.fn()),
    onCall: vi.fn(),
    onShare: vi.fn(),
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onReport: vi.fn(),
    onRetry: vi.fn(),
    selective: <div data-testid="selective-slot" />,
    ...over
  };
  return ctx;
};

const mount = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("item slots", () => {
  describe("TopBar", () => {
    it("shows the trail and, in the sheet layout only, a close button", async () => {
      const ctx = make({ layout: "sheet", isPage: false });
      const { unmount } = mount(<TopBar ctx={ctx} />);
      expect(screen.getByText("Fade Kings")).toBeInTheDocument();
      expect(screen.getByText("Fade and beard")).toHaveAttribute("aria-current", "page");
      await userEvent.click(screen.getByRole("button", { name: /close/i }));
      expect(ctx.onClose).toHaveBeenCalledTimes(1);
      unmount();
      mount(<TopBar ctx={make()} />);
      expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    });
  });

  describe("Flash", () => {
    it("renders nothing without a flash sale", () => {
      const { container } = mount(<Flash ctx={make()} />);
      expect(container).toBeEmptyDOMElement();
    });
    it("shows the banner, and the ended notice while a finished sale is held", () => {
      mount(<Flash ctx={make({ item: flashItem, hold: { id: "fade", leaving: false, regularPrice: 300 } })} />);
      expect(screen.getByTestId("banner")).toHaveAttribute("data-ended", "true");
      expect(screen.getByRole("status")).toHaveTextContent("300");
    });
  });

  describe("FlashSticky", () => {
    it("renders nothing without a flash sale or while a finished sale is held", () => {
      expect(mount(<FlashSticky ctx={make()} />).container).toBeEmptyDOMElement();
      expect(mount(<FlashSticky ctx={make({ item: flashItem, shown: flashItem.pricing, hold: { id: "fade" } })} />).container).toBeEmptyDOMElement();
    });
    it("shows the sale price, visible once the banner is out of view", () => {
      mount(<FlashSticky ctx={make({ item: flashItem, shown: flashItem.pricing, bannerInView: false })} />);
      expect(screen.getByTestId("sticky-price")).toHaveAttribute("data-visible", "true");
    });
  });

  describe("Offers", () => {
    it("renders nothing for an item in no offer, or with no item", () => {
      expect(mount(<Offers ctx={make()} />).container).toBeEmptyDOMElement();
      expect(mount(<Offers ctx={make({ item: null })} />).container).toBeEmptyDOMElement();
    });
    it("lists the offers the item is in", () => {
      mount(<Offers ctx={make({ item: { ...item, offers: [offerView("a")] } })} />);
      expect(screen.getByText("Offer a")).toBeInTheDocument();
    });
  });

  describe("Quantity and Delivery", () => {
    it("render nothing yet", () => {
      expect(mount(<Quantity ctx={make()} />).container).toBeEmptyDOMElement();
      expect(mount(<Delivery ctx={make()} />).container).toBeEmptyDOMElement();
    });
  });

  describe("SoldFrom", () => {
    it("renders nothing without a seller", () => {
      expect(mount(<SoldFrom ctx={make({ seller: null })} />).container).toBeEmptyDOMElement();
    });
    it("shows the seller, links to the store and calls, and wires share and report", async () => {
      const ctx = make({ sellerCount: 195, distanceKm: 1.2 });
      mount(<SoldFrom ctx={ctx} />);
      expect(screen.getByText("195 products")).toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Visit Store/ })).toHaveAttribute("href", "/b/fade-kings");
      expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", expect.stringContaining("tel:"));
      await userEvent.click(screen.getByRole("button", { name: /Share/ }));
      await userEvent.click(screen.getByRole("button", { name: /Report/ }));
      expect(ctx.onShare).toHaveBeenCalledTimes(1);
      expect(ctx.onReport).toHaveBeenCalledTimes(1);
    });
  });

  describe("StickyNav", () => {
    it("renders nothing without an item", () => {
      expect(mount(<StickyNav ctx={make({ item: null })} />).container).toBeEmptyDOMElement();
    });
    it("offers chat and visit, tagged as the footer", async () => {
      const handler = vi.fn();
      const ctx = make({ onChat: vi.fn(() => handler) });
      mount(<StickyNav ctx={ctx} />);
      expect(screen.getByRole("link", { name: /Visit Store/ })).toHaveAttribute("href", "/b/fade-kings");
      const chat = screen.getByRole("link", { name: /Chat Seller/ });
      chat.addEventListener("click", (e) => e.preventDefault());
      await userEvent.click(chat);
      expect(ctx.onChat).toHaveBeenCalledWith("footer");
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("Recommend", () => {
    it("renders nothing without an item", () => {
      expect(mount(<Recommend ctx={make({ item: null })} />).container).toBeEmptyDOMElement();
    });
    it("asks for items like this one", () => {
      mount(<Recommend ctx={make()} />);
      expect(screen.getByTestId("similar")).toHaveAttribute("data-item", "fade");
      expect(screen.getByTestId("similar")).toHaveAttribute("data-business", "b_001");
    });
    it("StoreMore excludes the open item and tracks a pick", async () => {
      const ctx = make();
      mount(<StoreMore ctx={ctx} />);
      expect(screen.getByTestId("selective")).toHaveAttribute("data-exclude", "fade");
      await userEvent.click(screen.getByRole("button", { name: "pick" }));
      expect(ctx.track).toHaveBeenCalledWith("store_selective_click", { targetItemId: "n1", position: 1 });
      expect(ctx.onSelect).toHaveBeenCalledWith("n1");
      await userEvent.click(screen.getByRole("button", { name: "see all" }));
      expect(ctx.track).toHaveBeenCalledWith("store_selective_click", { target: "see_all" });
    });
  });

  describe("States", () => {
    it("LoadFailed announces the failure and retries", async () => {
      const ctx = make();
      mount(<LoadFailed ctx={ctx} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button"));
      expect(ctx.onRetry).toHaveBeenCalledTimes(1);
    });
    it("Gone names the missing item, links back to the store and shows more from it", () => {
      mount(<Gone ctx={make({ item: null })} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("id", "item-title");
      expect(screen.getByRole("link", { name: /Visit Store/ })).toHaveAttribute("href", "/b/fade-kings");
      expect(screen.getByTestId("selective-slot")).toBeInTheDocument();
    });
    it("Loading is busy and shows more from the store", () => {
      const { container } = mount(<Loading ctx={make({ item: null })} />);
      expect(container.firstChild).toHaveAttribute("aria-busy", "true");
      expect(screen.getByTestId("selective-slot")).toBeInTheDocument();
    });
  });

  describe("ItemLayout", () => {
    it("draws the gallery, header, options and details, with the slots in place and the empty ones adding nothing", () => {
      const withVariants = { ...item, highlights: ["One"], pricing: pricing(300, 300, [{ id: "v1", label: "Small", regularPrice: 300, salePrice: 300, savings: 0, discountPercent: 0 }]) };
      const ctx = make({ item: withVariants, shown: withVariants.pricing });
      mount(<ItemLayout ctx={ctx} />);
      expect(screen.getByRole("heading", { name: "Fade and beard" })).toBeInTheDocument();
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /Sold by/ })).toBeInTheDocument();
      expect(screen.getByTestId("selective-slot")).toBeInTheDocument();
      expect(screen.getByTestId("similar")).toBeInTheDocument();
      expect(screen.queryByTestId("banner")).toBeNull();
    });
  });
});
