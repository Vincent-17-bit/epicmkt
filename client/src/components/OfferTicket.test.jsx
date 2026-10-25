import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import OfferStrip from "./OfferStrip.jsx";

const item = { id: "bottle", name: "20L bottle", business: { whatsapp: "0712345678" } };
const product = (id, name, price, role = "main") => ({ id, name, price, imageUrl: null, role });

const view = (offer, products, over = {}) => ({
  offer: { id: "o1", title: "Bottle + refill", description: null, conditions: {}, items: [], code: null, terms: null, endsAt: null, ...offer },
  business: {},
  remainingMs: 2 * 86400000,
  appliesToLabel: "",
  products,
  availableNow: true,
  ...over
});

const bundle = view(
  { kind: "bundle", config: { rewardType: "bundle_price", rewardValue: 450 }, code: "WATER", terms: "One per customer." },
  [product("bottle", "20L bottle", 400), product("refill", "20L refill", 100, "with")]
);

describe("the offer on a product page", () => {
  it("renders nothing when the product is in no offer", () => {
    const { container } = render(<OfferStrip offers={[]} item={item} price={400} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains the deal and what it is worth on this product's real price", () => {
    render(<OfferStrip offers={[bundle]} item={item} price={400} />);
    expect(screen.getByText("Together for KES 450")).toBeInTheDocument();
    expect(screen.getByText("Pay KES 450 for the set instead of KES 500")).toBeInTheDocument();
    expect(screen.getByText("You save KES 50")).toBeInTheDocument();
    expect(screen.getByText("One per customer.")).toBeInTheDocument();
    expect(screen.getByText("WATER")).toBeInTheDocument();
  });

  it("lists the other products in the bundle and opens the one the customer taps", () => {
    const onOpenProduct = vi.fn();
    render(<OfferStrip offers={[bundle]} item={item} price={400} onOpenProduct={onOpenProduct} />);
    expect(screen.getByText("Buy together with")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open 20L bottle" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open 20L refill" }));
    expect(onOpenProduct).toHaveBeenCalledWith("refill");
  });

  it("claims the deal with the seller on WhatsApp, naming the offer, the product and the code", () => {
    render(<OfferStrip offers={[bundle]} item={item} price={400} />);
    const link = screen.getByRole("link", { name: "Claim on WhatsApp" });
    const href = link.getAttribute("href");
    expect(href).toContain("wa.me/254712345678");
    const text = decodeURIComponent(href.split("text=")[1]);
    expect(text).toContain("Bundle KES 450");
    expect(text).toContain("20L bottle");
    expect(text).toContain("code WATER");
  });

  it("has no savings line when the maths needs a price that is not there", () => {
    render(<OfferStrip offers={[bundle]} item={item} price={null} />);
    expect(screen.queryByText(/You save/)).not.toBeInTheDocument();
  });

  it("uses the price the customer pays now, so a flash price is the one the deal is worked on", () => {
    const pct = view({ kind: "percent_off", config: { percent: 10 } }, [product("bottle", "20L bottle", 400)]);
    render(<OfferStrip offers={[pct]} item={item} price={300} />);
    expect(screen.getByText("Pay KES 270 instead of KES 300")).toBeInTheDocument();
  });

  it("states the hours and days a deal is limited to, and when it is not running now", () => {
    const happy = view({ kind: "percent_off", config: { percent: 20 }, conditions: { daysOfWeek: ["mon", "tue", "wed", "thu", "fri"], hours: { from: "16:00", to: "18:00" } } }, [product("bottle", "20L bottle", 400)], { availableNow: false });
    render(<OfferStrip offers={[happy]} item={item} price={400} />);
    expect(screen.getByText("Weekdays")).toBeInTheDocument();
    expect(screen.getByText("4pm to 6pm")).toBeInTheDocument();
    expect(screen.getByText("Not running at this hour")).toBeInTheDocument();
  });

  it("shows two offers and folds the rest behind a button", () => {
    const many = [1, 2, 3].map((n) => view({ id: `o${n}`, kind: "percent_off", config: { percent: n * 5 }, title: `Deal ${n}` }, [product("bottle", "20L bottle", 400)]));
    render(<OfferStrip offers={many} item={item} price={400} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /See all 3/ }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
});
