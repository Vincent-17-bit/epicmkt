import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { offerValidity } from "../../lib/itemView.js";
import PromotionsRow from "./PromotionsRow.jsx";
import { seriousViolations } from "../../test/axe.js";

const item = { id: "bottle", name: "20L bottle", business: { whatsapp: "0712345678" } };
const view = (id, over = {}, viewOver = {}) => ({
  offer: { id, title: `Deal ${id}`, kind: "bundle", config: { rewardType: "bundle_price", rewardValue: 450 }, description: null, conditions: {}, items: [], code: null, terms: null, startsAt: null, endsAt: null, chipText: `Tag ${id}`, ...over },
  business: {},
  remainingMs: 2 * 86400000,
  appliesToLabel: "",
  products: [{ id: "bottle", name: "20L bottle", price: 400, imageUrl: null, role: "main" }],
  availableNow: true,
  ...viewOver
});
const bar = () => screen.getByRole("button", { name: /Claim now/ });

describe("the compact promotions row", () => {
  it("renders nothing when the product is in no offer", () => {
    expect(render(<PromotionsRow offers={[]} item={item} price={400} />).container).toBeEmptyDOMElement();
  });

  it("shows a tag for each offer and keeps the cards closed", () => {
    render(<PromotionsRow offers={[view("a"), view("b")]} item={item} price={400} />);
    expect(screen.getByText("Tag a")).toBeInTheDocument();
    expect(screen.getByText("Tag b")).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("shows three tags and the count of the rest", () => {
    render(<PromotionsRow offers={["a", "b", "c", "d", "e"].map((id) => view(id))} item={item} price={400} />);
    expect(screen.getByText("Tag c")).toBeInTheDocument();
    expect(screen.queryByText("Tag d")).toBeNull();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("opens every offer as a card, and closes again", async () => {
    const user = userEvent.setup();
    render(<PromotionsRow offers={["a", "b", "c", "d"].map((id) => view(id))} item={item} price={400} />);
    await user.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("article")).toHaveLength(4);
    await user.click(bar());
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("closes with Escape and puts focus back on the row", async () => {
    const user = userEvent.setup();
    render(<PromotionsRow offers={[view("a", { code: "SAVE" })]} item={item} price={400} />);
    await user.click(bar());
    await user.click(screen.getByRole("button", { name: /Copy code/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(bar()).toHaveFocus();
  });

  it("each card has its terms, code, validity dates and a claim link to the seller", async () => {
    const user = userEvent.setup();
    const offer = { code: "WATER10", terms: "One per customer.", startsAt: "2026-10-30T06:00:00.000Z", endsAt: "2026-11-30T20:00:00.000Z" };
    render(<PromotionsRow offers={[view("a", offer)]} item={item} price={400} />);
    await user.click(bar());
    const card = screen.getByRole("article");
    expect(within(card).getByText("One per customer.")).toBeInTheDocument();
    expect(within(card).getByText("WATER10")).toBeInTheDocument();
    expect(within(card).getByText("Valid: 30 Oct - 30 Nov 2026")).toBeInTheDocument();
    const claim = within(card).getByRole("link", { name: /Claim on WhatsApp/ });
    expect(claim.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/254712345678\?text=/);
  });

  it("leaves the dates out of cards shown elsewhere", () => {
    const { container } = render(<PromotionsRow offers={[view("a")]} item={item} price={400} />);
    expect(container.textContent).not.toContain("Valid:");
  });
});

describe("offerValidity", () => {
  it("joins the two dates, sharing the year when it is the same", () => {
    expect(offerValidity({ startsAt: "2026-10-30T06:00:00.000Z", endsAt: "2026-11-30T20:00:00.000Z" })).toBe("30 Oct - 30 Nov 2026");
  });

  it("keeps both years across a year end", () => {
    expect(offerValidity({ startsAt: "2026-12-20T06:00:00.000Z", endsAt: "2027-01-05T20:00:00.000Z" })).toBe("20 Dec 2026 - 5 Jan 2027");
  });

  it("reads the date in Nairobi time, where it is already the next day", () => {
    expect(offerValidity({ startsAt: "2026-10-30T22:30:00.000Z", endsAt: "2026-11-30T22:30:00.000Z" })).toBe("31 Oct - 1 Dec 2026");
  });

  it("says Until or From when only one date is set, and nothing without dates or with bad ones", () => {
    expect(offerValidity({ endsAt: "2026-11-30T20:00:00.000Z" })).toBe("Until 30 Nov 2026");
    expect(offerValidity({ startsAt: "2026-11-30T06:00:00.000Z" })).toBe("From 30 Nov 2026");
    expect(offerValidity({})).toBeNull();
    expect(offerValidity({ startsAt: "nope", endsAt: "nope" })).toBeNull();
    expect(offerValidity(null)).toBeNull();
  });

  it("falls back to Nairobi time for an unknown time zone", () => {
    expect(offerValidity({ startsAt: "2026-10-30T22:30:00.000Z", endsAt: "2026-11-30T22:30:00.000Z" }, "Not/AZone")).toBe("31 Oct - 1 Dec 2026");
  });

  it("has no serious accessibility violations open or closed", async () => {
    const user = userEvent.setup();
    const { container } = render(<PromotionsRow offers={[view("a"), view("b")]} item={item} price={400} />);
    expect(await seriousViolations(container)).toEqual([]);
    await user.click(bar());
    expect(await seriousViolations(container)).toEqual([]);
  });
});
