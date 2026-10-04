import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import FlashSaleCard from "./FlashSaleCard.jsx";

const entry = (over = {}) => ({
  sale: {
    id: "f_x",
    headline: "Weekend fade deal",
    quantityNote: "Walk-ins only",
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 2 * 3600000 + 4 * 60000 + 30000).toISOString(),
    discount: { type: "percent", value: 35 },
    ...over
  },
  item: { id: "fade-and-beard", name: "Fade and beard", imageUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
  pricing: { regularPrice: 450, salePrice: 300, savings: 150, discountPercent: 33 },
  business: { id: "b_001", slug: "fade-kings", name: "Fade Kings", logo: null, verified: true, distanceKm: 1.4, isOpen: true }
});

const view = (props) =>
  render(
    <MemoryRouter>
      <FlashSaleCard {...props} />
    </MemoryRouter>
  );

describe("FlashSaleCard", () => {
  it("is one link to the store with the item and a full label", () => {
    view({ entry: entry() });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/b/fade-kings?item=fade-and-beard");
    expect(link.getAttribute("aria-label")).toBe("Flash sale: Fade and beard, KES 300, Ends in 2 hours 5 minutes");
  });

  it("shows the badge, savings, headline, note and CTA", () => {
    view({ entry: entry() });
    expect(screen.getByText("-35%")).toBeInTheDocument();
    expect(screen.getByText(/Save KES 150/)).toBeInTheDocument();
    expect(screen.getByText("Weekend fade deal")).toBeInTheDocument();
    expect(screen.getByText("Walk-ins only")).toBeInTheDocument();
    expect(screen.getByText("View deal")).toBeInTheDocument();
  });

  it("swaps the band label when the sale is ending", () => {
    view({ entry: entry({ endsAt: new Date(Date.now() + 20 * 60000).toISOString() }) });
    expect(screen.getByText("Ending soon")).toBeInTheDocument();
  });

  it("uses a ribbon and no CTA in compact size", () => {
    view({ entry: entry({ discount: { type: "amount_off", value: 150 } }), size: "compact" });
    expect(screen.getByText("KES 150 OFF")).toBeInTheDocument();
    expect(screen.queryByText("View deal")).toBeNull();
  });
});
