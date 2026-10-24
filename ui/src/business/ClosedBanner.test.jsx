import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ClosedBanner from "./ClosedBanner.jsx";

describe("ClosedBanner", () => {
  it("shows the seller's reason and when the shop reopens", () => {
    render(<ClosedBanner status={{ isOpen: false, reasonText: "Closed today: Public holiday", reopens: "Reopens tomorrow at 8:00 AM" }} />);
    expect(screen.getByText("Closed today: Public holiday")).toBeInTheDocument();
    expect(screen.getByText("Reopens tomorrow at 8:00 AM")).toBeInTheDocument();
  });

  it("falls back to a plain closed message outside normal hours", () => {
    render(<ClosedBanner status={{ isOpen: false, reasonText: null, reopens: "Reopens today at 8:00 AM" }} />);
    expect(screen.getByText("Closed right now")).toBeInTheDocument();
  });

  it("shows nothing for a normally open shop", () => {
    const { container } = render(<ClosedBanner status={{ isOpen: true, reasonText: null, closes: "Closes 6:00 PM" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains special hours while the shop is open", () => {
    render(<ClosedBanner status={{ isOpen: true, reasonText: "Special hours today: Stocktake", closes: "Closes 12:00 PM" }} />);
    expect(screen.getByText("Special hours today: Stocktake")).toBeInTheDocument();
  });
});
