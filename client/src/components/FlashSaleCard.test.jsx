import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlashSaleCard from "./FlashSaleCard.jsx";
import FlashSkeleton from "./FlashSkeleton.jsx";
import HeatSection from "./HeatSection.jsx";

const IMG = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

const entry = (over = {}, business = {}) => ({
  sale: {
    id: "f_x",
    headline: "Weekend fade deal",
    quantityNote: "Walk-ins only",
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 2 * 3600000 + 4 * 60000 + 30000).toISOString(),
    discount: { type: "percent", value: 35 },
    ...over
  },
  item: { id: "fade-and-beard", name: "Fade and beard", imageUrl: IMG },
  pricing: { regularPrice: 450, salePrice: 300, savings: 150, discountPercent: 33 },
  business: { id: "b_001", slug: "fade-kings", name: "Fade Kings", logo: IMG, verified: true, distanceKm: 1.4, isOpen: true, ...business }
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
    expect(screen.getByRole("link")).toHaveAttribute("data-urgency", "urgent");
  });

  it("labels the last minutes in words, not only colour", () => {
    view({ entry: entry({ endsAt: new Date(Date.now() + 3 * 60000).toISOString() }) });
    expect(screen.getByText("Last chance")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("data-urgency", "critical");
  });

  it("keeps the compact variant to its own role: badge, timer chip, name and price, no CTA", () => {
    view({ entry: entry({ discount: { type: "amount_off", value: 150 } }), size: "compact" });
    expect(screen.getByText("KES 150 OFF")).toBeInTheDocument();
    expect(screen.getByText("Fade and beard")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.queryByText("View deal")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("data-size", "compact");
  });
});

describe.each(["standard", "hero"])("FlashSaleCard %s size keeps every element", (size) => {
  it("renders photo, badge, bolt, fuse, urgency, countdown, name, headline, store row, prices, tags and CTA", () => {
    const { container } = view({ entry: entry(), size });
    const link = screen.getByRole("link");

    // link target, aria-label and data attributes
    expect(link).toHaveAttribute("href", "/b/fade-kings?item=fade-and-beard");
    expect(link).toHaveAttribute("aria-label", expect.stringContaining("Fade and beard"));
    expect(link).toHaveAttribute("data-card", "");
    expect(link).toHaveAttribute("data-size", size);
    expect(link).toHaveAttribute("data-urgency", "soon");
    expect(link).toHaveAttribute("draggable", "false");

    // photo (lazy) and store logo (lazy)
    const photos = container.querySelectorAll("img");
    expect(photos).toHaveLength(2);
    photos.forEach((img) => expect(img).toHaveAttribute("loading", "lazy"));

    // discount badge, bolt chip, fuse bar
    expect(within(link).getByText("-35%")).toBeInTheDocument();
    expect(container.querySelectorAll("svg[data-icon='bolt']").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector("[data-urgency][style*='--share']")).not.toBeNull();

    // urgency label and live countdown tiles
    expect(screen.getByText("Flash sale", { selector: "span" })).toBeInTheDocument();
    expect(container.textContent).toMatch(/Hrs/);
    expect(container.textContent).toMatch(/Min/);
    expect(container.textContent).toMatch(/Sec/);

    // item name, headline, store row
    expect(screen.getByText("Fade and beard")).toBeInTheDocument();
    expect(screen.getByText("Weekend fade deal")).toBeInTheDocument();
    expect(screen.getByText("Fade Kings")).toBeInTheDocument();
    expect(screen.getByLabelText("Verified")).toBeInTheDocument();
    expect(screen.getByText(/1\.4/)).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();

    // prices, struck regular price, save tag, quantity note, CTA
    expect(screen.getByText("300")).toBeInTheDocument();
    const was = container.querySelector("s");
    expect(was).not.toBeNull();
    expect(was.textContent).toMatch(/450/);
    expect(screen.getByText("Save KES 150")).toBeInTheDocument();
    expect(screen.getByText("Walk-ins only")).toBeInTheDocument();
    expect(screen.getByText("View deal")).toBeInTheDocument();
  });

  it("shows the closed state and omits optional parts without breaking", () => {
    const bare = entry({ headline: null, quantityNote: null }, { isOpen: false, verified: false, distanceKm: null, logo: null });
    bare.pricing = { regularPrice: 300, salePrice: 300, savings: 0, discountPercent: 0 };
    const { container } = view({ entry: bare, size });
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Verified")).toBeNull();
    expect(container.querySelector("s")).toBeNull();
    expect(screen.queryByText(/Save KES/)).toBeNull();
    expect(screen.getByText("View deal")).toBeInTheDocument();
  });
});

describe("FlashSaleCard countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps ticking, and marks the card ended when time is up", () => {
    const { container } = view({ entry: entry({ endsAt: new Date(Date.now() + 5000).toISOString() }) });
    const before = container.textContent;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.textContent).not.toBe(before);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByRole("link")).toHaveAttribute("data-urgency", "ended");
  });
});

describe("FlashSaleCard is calm", () => {
  it("has no hero layout, embers, sweep or animation hooks left in the markup", () => {
    const { container } = view({ entry: entry(), size: "hero" });
    const html = container.innerHTML;
    for (const gone of ["ember", "sweep", "vignette", "data-animate", "data-revealed", "data-flip"]) {
      expect(html).not.toContain(gone);
    }
  });
});

describe("FlashSkeleton", () => {
  it("is hidden from assistive tech and uses the card's own layout classes", () => {
    const { container: card } = view({ entry: entry() });
    const { container } = render(<FlashSkeleton />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton.className).toBe(card.querySelector("a").className);
    for (const slot of ["media", "band", "body", "cta"]) {
      expect(skeleton.querySelectorAll(`[class*="${slot}"]`).length).toBeGreaterThan(0);
    }
  });
});

describe("HeatSection", () => {
  it("keeps the heading, count, see-all link and nearest-end timer", () => {
    render(
      <MemoryRouter>
        <HeatSection id="heat" count={3} nearestEndsAt={new Date(Date.now() + 3600000).toISOString()} seeAllTo="/flash">
          <p>strip</p>
        </HeatSection>
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /Flash sales/ })).toBeInTheDocument();
    expect(screen.getByText(/3\s+/)).toBeInTheDocument();
    expect(screen.getByText("Ends soonest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute("href", "/flash");
    expect(screen.getByText("strip")).toBeInTheDocument();
  });
});
