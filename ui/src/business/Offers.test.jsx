import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Offers, { expiryText } from "./Offers.jsx";

const deal = (over = {}) => ({
  id: "o1",
  kind: "buy_x_get_y",
  title: "Bread deal",
  label: "Buy 2 Get 1 Free",
  headline: "Buy 2, get 1 free",
  description: "Fresh every morning",
  code: "BREAD",
  terms: "While stock lasts.",
  remainingMs: 2 * 86400000 + 3600000,
  conditions: ["Fri, Sat, Sun"],
  availableNow: true,
  products: [{ id: "bread", name: "Bread 400g", price: 65, imageUrl: null, role: "main" }],
  ...over
});

describe("expiryText", () => {
  it("speaks in days, hours and minutes, and says nothing for an offer with no end", () => {
    expect(expiryText(null)).toBeNull();
    expect(expiryText(30 * 1000)).toBe("Ends in 1 min");
    expect(expiryText(45 * 60000)).toBe("Ends in 45 min");
    expect(expiryText(60 * 60000)).toBe("Ends in 1 hour");
    expect(expiryText(5 * 3600000)).toBe("Ends in 5 hours");
    expect(expiryText(86400000)).toBe("Ends in 1 day");
    expect(expiryText(3 * 86400000)).toBe("Ends in 3 days");
    expect(expiryText(3 * 86400000, "Ina")).toBe("Ina 3 days");
  });
});

describe("store page offers", () => {
  it("prints the deal, its products, conditions, code, end and terms", () => {
    render(<Offers offers={[deal()]} />);
    expect(screen.getByRole("heading", { name: "Offers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bread deal" })).toBeInTheDocument();
    expect(screen.getByText("Buy 2, get 1 free")).toBeInTheDocument();
    expect(screen.getByText("Bread 400g")).toBeInTheDocument();
    expect(screen.getByText("Fri, Sat, Sun")).toBeInTheDocument();
    expect(screen.getByText("BREAD")).toBeInTheDocument();
    expect(screen.getByText("Ends in 2 days")).toBeInTheDocument();
    expect(screen.getByText("While stock lasts.")).toBeInTheDocument();
  });

  it("opens the product the customer taps", () => {
    const onOpenItem = vi.fn();
    render(<Offers offers={[deal({ products: [{ id: "a", name: "A", role: "main" }, { id: "b", name: "B", role: "with" }], kind: "bundle" })]} onOpenItem={onOpenItem} />);
    fireEvent.click(screen.getByRole("button", { name: "Open B" }));
    expect(onOpenItem).toHaveBeenCalledWith("b");
  });

  it("shows a few products and counts the rest", () => {
    const products = Array.from({ length: 7 }, (_, n) => ({ id: `p${n}`, name: `P${n}`, role: "main" }));
    render(<Offers offers={[deal({ products })]} />);
    expect(screen.getAllByRole("button", { name: /^Open P/ })).toHaveLength(4);
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("says when a happy-hour deal is not running at this hour", () => {
    render(<Offers offers={[deal({ availableNow: false })]} />);
    expect(screen.getByText("Not running at this hour")).toBeInTheDocument();
  });

  it("has no end text for an offer that does not end, and no code row without a code", () => {
    render(<Offers offers={[deal({ remainingMs: null, code: null, conditions: [], terms: null })]} />);
    expect(screen.queryByText(/Ends in/)).not.toBeInTheDocument();
    expect(screen.queryByText("Code")).not.toBeInTheDocument();
  });

  it("copies the code", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Offers offers={[deal()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code BREAD" }));
    expect(writeText).toHaveBeenCalledWith("BREAD");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("is inert in the seller's preview", () => {
    const onOpenItem = vi.fn();
    render(<Offers offers={[deal()]} mode="preview" onOpenItem={onOpenItem} />);
    expect(screen.getByRole("button", { name: "Copy code BREAD" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Open Bread 400g" }));
    expect(onOpenItem).not.toHaveBeenCalled();
  });
});
